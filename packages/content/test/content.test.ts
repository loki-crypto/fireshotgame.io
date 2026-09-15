import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import {
  applyEffects, applyTerminalResult, checkAnswer, createWorld, exitRequirementsMet, generateQuestion, openDoor,
  type Cell, type World,
} from "@fireshot/sim";
import { registry, phases, pools } from "../index";
import { canonicalAnswer } from "./canonical";
import phaseSchema from "../schemas/phase.schema.json";
import enemySchema from "../schemas/enemy.schema.json";
import weaponSchema from "../schemas/weapon.schema.json";
import upgradeSchema from "../schemas/upgrade.schema.json";
import badgeSchema from "../schemas/badge.schema.json";
import enemiesJson from "../enemies.json";
import weaponsJson from "../weapons.json";
import upgradesJson from "../upgrades.json";
import badgesJson from "../badges.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });

function validate(schema: object, data: unknown, label: string): void {
  const v = ajv.compile(schema);
  const ok = v(data);
  if (!ok) throw new Error(`${label}: ${ajv.errorsText(v.errors, { separator: "\n" })}`);
}

function bfs(w: World, start: Cell): Set<number> {
  const g = w.grid;
  const seen = new Set<number>([g.cellIndex(start[0], start[1])]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc, nr = r + dr;
      if (!g.isWalkable(nc, nr)) continue;
      const k = g.cellIndex(nc, nr);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([nc, nr]);
    }
  }
  return seen;
}

describe("schemas", () => {
  it("inimigos, armas, upgrades e badges seguem o schema", () => {
    validate(enemySchema, enemiesJson, "enemies.json");
    validate(weaponSchema, weaponsJson, "weapons.json");
    validate(upgradeSchema, upgradesJson, "upgrades.json");
    validate(badgeSchema, badgesJson, "badges.json");
  });

  for (const p of phases) {
    it(`fase ${p.id} segue o schema`, () => validate(phaseSchema, p, p.id));
  }
});

describe("integridade referencial", () => {
  const enemyIds = new Set(registry.enemies.map((e) => e.id));
  const weaponIds = new Set(registry.weapons.map((w) => w.id));
  const upgradeIds = new Set(registry.upgrades.map((u) => u.id));

  it("contramedidas e upgrades referenciam ids existentes", () => {
    for (const e of registry.enemies) for (const w of e.counters.strong) expect(weaponIds, `${e.id} → ${w}`).toContain(w);
    for (const u of registry.upgrades) for (const r of u.requires) expect(upgradeIds, `${u.id} → ${r}`).toContain(r);
    const slots = registry.weapons.map((w) => w.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("badges de fase referenciam fases existentes", () => {
    for (const b of registry.badges) {
      const c = b.criterion;
      if ((c.type === "phase_completed" || c.type === "phase_flag") && "phase" in c && c.phase) {
        expect(phases.map((p) => p.id), b.id).toContain(c.phase);
      }
    }
  });

  for (const p of phases) {
    it(`fase ${p.id}: ids, glifos, rotas, spawners e portas consistentes`, () => {
      const rowsTxt = p.layout.rows.join("");
      for (const g of Object.keys(p.legend)) expect(rowsTxt.includes(g), `glifo '${g}' não usado`).toBe(true);
      expect(Object.values(p.legend).filter((l) => l.type === "player").length).toBe(1);
      const widths = new Set(p.layout.rows.map((r) => r.length));
      expect(widths.size, "linhas com larguras diferentes").toBe(1);
      for (const w of p.weaponsAvailable) expect(weaponIds).toContain(w);
      const w = createWorld({ reg: registry, phaseId: p.id, seed: 1 });
      // bordas do mapa fechadas
      for (let c = 0; c < w.grid.cols; c++) { expect(w.grid.isWalkable(c, 0)).toBe(false); expect(w.grid.isWalkable(c, w.grid.rows - 1)).toBe(false); }
      for (let r = 0; r < w.grid.rows; r++) { expect(w.grid.isWalkable(0, r)).toBe(false); expect(w.grid.isWalkable(w.grid.cols - 1, r)).toBe(false); }
      const doorIds = new Set(w.doors.map((d) => d.id));
      const spawnerIds = new Set(w.spawners.map((s) => s.id));
      const effects = [...p.terminals.flatMap((t) => t.onSolve), ...(p.arenas ?? []).flatMap((a) => a.onClear), ...(p.triggers ?? []).flatMap((t) => t.effects)];
      for (const e of effects) {
        if (e.type === "openDoor" || e.type === "closeDoor") expect(doorIds, `${p.id}: porta ${e.door}`).toContain(e.door);
        if (e.type === "disableSpawner" || e.type === "enableSpawner" || e.type === "spawnPickups" || e.type === "spawnEnemies") expect(spawnerIds, `${p.id}: spawner ${e.spawner}`).toContain(e.spawner);
        if (e.type === "spawnEnemies") expect(enemyIds).toContain(e.enemy);
      }
      const opened = new Set(effects.filter((e) => e.type === "openDoor").map((e) => (e as { door: string }).door));
      for (const d of doorIds) expect(opened.has(d), `${p.id}: porta ${d} nunca abre`).toBe(true);
      for (const a of p.arenas ?? []) {
        for (const d of a.lockDoors ?? []) expect(doorIds).toContain(d);
        for (const wave of a.waves) for (const s of wave.spawns) {
          expect(spawnerIds, `${p.id}: spawner ${s.spawner}`).toContain(s.spawner);
          expect(enemyIds).toContain(s.enemy);
        }
      }
      for (const s of p.spawners ?? []) if (s.enemy) expect(enemyIds).toContain(s.enemy);
      for (const [name, cells] of Object.entries(p.routes ?? {})) for (const [c, r] of cells) expect(w.grid.isWalkable(c, r), `${p.id}: rota ${name} [${c},${r}]`).toBe(true);
      for (const t of p.terminals) {
        for (const r of t.requires ?? []) expect(p.terminals.map((x) => x.id)).toContain(r);
        const ent = w.terminals.find((x) => x.id === t.id);
        expect(ent, `${p.id}: terminal ${t.id} fora do mapa`).toBeDefined();
      }
      for (const id of p.exit.requires.terminals ?? []) expect(p.terminals.map((t) => t.id)).toContain(id);
      for (const id of p.exit.requires.arenas ?? []) expect((p.arenas ?? []).map((a) => a.id)).toContain(id);
    });
  }
});

describe("fases são completáveis (sem travas de progressão)", () => {
  for (const p of phases) {
    it(`fase ${p.id} pode ser concluída resolvendo terminais e arenas em ordem`, () => {
      const w = createWorld({ reg: registry, phaseId: p.id, seed: 7 });
      const start = w.grid.worldToCell(w.playerStart.pos.x, w.playerStart.pos.z);
      const exitZone = w.zones.find((z) => z.type === "exit");
      expect(exitZone).toBeDefined();
      for (let iter = 0; iter < 60; iter++) {
        const reach = bfs(w, start);
        let progress = false;
        for (const t of w.terminals) {
          if (t.solved) continue;
          const reqOk = (t.def.requires ?? []).every((id) => w.terminals.find((x) => x.id === id)?.solved);
          const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => reach.has(w.grid.cellIndex(t.cell[0] + dc!, t.cell[1] + dr!)));
          if (reqOk && adj) {
            for (let i = 0; i < t.def.challenges; i++) applyTerminalResult(w, t.id, true, false);
            progress = true;
          }
        }
        for (const a of w.arenas) {
          if (a.state !== "idle") continue;
          const zone = w.zones.find((z) => z.type === "arena" && z.id === a.id);
          if (zone && [...zone.cells].some((k) => reach.has(k))) {
            a.state = "cleared";
            for (const d of a.def.lockDoors ?? []) openDoor(w, d);
            applyEffects(w, a.def.onClear);
            progress = true;
          }
        }
        if (p.exit.requires.bossDefeated && !w.bossDefeated && w.bossId) {
          const boss = w.enemies.find((e) => e.id === w.bossId)!;
          const bc = w.grid.worldToCell(boss.pos.x, boss.pos.z);
          if (reach.has(w.grid.cellIndex(bc[0], bc[1]))) { w.bossDefeated = true; progress = true; }
        }
        for (const f of p.exit.requires.flags ?? []) if (!w.flags.has(f)) { /* flags vêm de efeitos de terminais */ }
        if (exitRequirementsMet(w) && [...exitZone!.cells].some((k) => reach.has(k))) return;
        if (!progress) break;
      }
      throw new Error(`${p.id}: não foi possível alcançar a saída com os requisitos cumpridos`);
    });
  }
});

describe("terminais: geradores produzem questões válidas", () => {
  for (const p of phases) {
    for (const t of p.terminals) {
      it(`${p.id}/${t.id} (${t.generator}) gera questões consistentes e aceita o gabarito`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const q = generateQuestion(t.generator, t.params, seed * 2654435761 >>> 0, pools);
          const again = generateQuestion(t.generator, t.params, seed * 2654435761 >>> 0, pools);
          expect(again).toEqual(q);
          expect(q.prompt.length).toBeGreaterThan(5);
          expect(q.explanation.length).toBeGreaterThan(5);
          const res = checkAnswer(q, canonicalAnswer(q));
          expect(res.correct, `${t.generator} seed ${seed}`).toBe(true);
          if (q.kind === "mc") {
            expect(new Set(q.options).size).toBe(q.options.length);
            expect(checkAnswer(q, (q.answer + 1) % q.options.length).correct).toBe(false);
          }
          if (q.kind === "match") {
            expect(new Set(q.answer).size).toBe(q.answer.length);
            expect(new Set(q.right).size).toBe(q.right.length);
          }
        }
      });
    }
  }
});
