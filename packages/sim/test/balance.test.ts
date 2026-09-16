import { describe, expect, it } from "vitest";
import { curriculum, registry } from "@fireshot/content";
import {
  applyEffects, applyTerminalResult, canonicalAnswer, checkAnswer, counterKind, createWorld, eyePosition, findPath,
  findWeaponDef, generateQuestion, isAmmoWeapon, lineOfSight, openDoor, questionSeed, refreshStatuses, stepWorld, targetCenter,
  type Cell, type EnemyDef, type EnemyStatus, type PhaseDef, type World,
} from "../src";
import { aimAt, input } from "./helpers";

/**
 * Balanceamento headless: um bot joga cada fase do currículo com seeds diferentes.
 * Ele resolve terminais ao alcance, dispara na ameaça visível mais próxima com a
 * contramedida certa, limpa arenas e vai à saída.
 *
 * O bot é socorrido quando a integridade cai (`resgates`) em vez de morrer: assim o teste
 * mede **percurso e pressão** (tempo até a saída, dano tomado, socorros) sem depender da
 * perícia de combate do bot, que não representa um jogador humano com escudo e scanner.
 */
const SEEDS = [1, 7, 4242];
const RESCUE_AT = 0.3;

interface RunResult {
  phaseId: string;
  seed: number;
  completed: boolean;
  time: number;
  rescues: number;
  kills: number;
  damageTaken: number;
  terminalsSolved: number;
}

/** Arma mais eficaz contra o inimigo, ignorando as que estão sem munição. */
function bestSlot(w: World, def: EnemyDef, statuses: ReadonlySet<EnemyStatus>): number {
  let best = findWeaponDef(w.reg, w.weaponsAvailable[0]!).slot;
  let bestScore = -1;
  for (const id of w.weaponsAvailable) {
    const weapon = findWeaponDef(w.reg, id);
    if (weapon.kind === "scanner" || weapon.kind === "shield") continue;
    const state = w.player.weapons.find((ws) => ws.defId === id);
    if (state && isAmmoWeapon(weapon) && state.magazine === 0 && state.reserve === 0) continue;
    const kind = counterKind(weapon, def, statuses);
    // contramedida primeiro; entre iguais, hitscan acerta alvo em movimento melhor que projétil
    const score = (kind === "strong" ? 30 : kind === "neutral" ? 20 : 10) + (weapon.kind === "hitscan" ? 3 : 0) + (weapon.damage ?? 0) / 100;
    if (score > bestScore) { bestScore = score; best = weapon.slot; }
  }
  return best;
}

const SCANNER_RANGE = 15;

/** Ameaça que só fica vulnerável depois de revelada (Rootkit, Trojan disfarçado). */
function needsScan(w: World): boolean {
  if (!w.weaponsAvailable.includes("scanner")) return false;
  return w.enemies.some((e) => {
    if (!e.alive || e.revealedUntil > w.time) return false;
    const hides = e.disguised || (e.def.counters.strongWhen ?? []).includes("revealed");
    return hides && Math.hypot(e.pos.x - w.player.pos.x, e.pos.z - w.player.pos.z) < SCANNER_RANGE;
  });
}

function solveReachableTerminals(w: World, seed: number): void {
  for (const t of w.terminals) {
    if (t.solved) continue;
    if ((t.def.requires ?? []).some((id) => !w.terminals.find((x) => x.id === id)?.solved)) continue;
    const d = Math.hypot(t.pos.x - w.player.pos.x, t.pos.z - w.player.pos.z);
    if (d > 3.2) continue;
    t.corrupted = false;
    while (!t.solved) {
      const q = generateQuestion(t.def.generator, t.def.params, questionSeed(seed, t.id, t.solvedChallenges, t.attemptsOnChallenge + 1), w.reg.pools);
      expect(checkAnswer(q, canonicalAnswer(q)).correct, `${t.def.generator}: gabarito inválido`).toBe(true);
      applyTerminalResult(w, t.id, true, false);
    }
  }
}

/** Células caminháveis vizinhas a uma célula ocupada (console, cofre). */
function sidesOf(w: World, cell: Cell): Cell[] {
  const dirs: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return dirs.map(([dc, dr]) => [cell[0] + dc, cell[1] + dr] as Cell).filter(([c, r]) => w.grid.isWalkable(c, r));
}

/** Objetivo alcançável mais próximo (A* do próprio jogo): ignora alvos atrás de portas fechadas. */
function nearestReachable(w: World, goals: Cell[]): { goal: Cell; path: Cell[] } | null {
  const start = w.grid.worldToCell(w.player.pos.x, w.player.pos.z);
  let best: { goal: Cell; path: Cell[] } | null = null;
  for (const goal of goals) {
    if (goal[0] === start[0] && goal[1] === start[1]) return { goal, path: [start] };
    const path = findPath(w.grid, start, goal);
    if (path.length === 0) continue;
    if (!best || path.length < best.path.length) best = { goal, path };
  }
  return best;
}

function zoneCells(w: World, type: "arena" | "exit", id?: string): Cell[] {
  const zone = w.zones.find((z) => z.type === type && (id === undefined || z.id === id));
  if (!zone) return [];
  return [...zone.cells].map((k) => [k % w.grid.cols, Math.floor(k / w.grid.cols)] as Cell);
}

/** Células alcançáveis das ameaças vivas (o bot caça durante arena e luta de chefe). */
function threatCells(w: World): Cell[] {
  return w.enemies
    .filter((e) => e.alive)
    .map((e) => w.grid.worldToCell(e.pos.x, e.pos.z))
    .flatMap((cell) => (w.grid.isWalkable(cell[0], cell[1]) ? [cell] : sidesOf(w, cell)));
}

/** Plano do bot: arena em curso → terminal liberado → arena pendente → chefe → saída. */
function plan(w: World): { goal: Cell; path: Cell[] } | null {
  // arena ativa tranca as portas: é preciso caçar as ondas, não esperar que elas venham
  const active = w.arenas.find((a) => a.state === "active");
  if (active) {
    const hunt = nearestReachable(w, threatCells(w));
    if (hunt) return hunt;
    const viaArena = nearestReachable(w, zoneCells(w, "arena", active.id));
    if (viaArena) return viaArena;
  }

  const pending = w.terminals.filter(
    (t) => !t.solved && (t.def.requires ?? []).every((id) => w.terminals.find((x) => x.id === id)?.solved),
  );
  const viaTerminal = nearestReachable(w, pending.flatMap((t) => sidesOf(w, t.cell)));
  if (viaTerminal) return viaTerminal;

  const arena = w.arenas.find((a) => a.state !== "cleared");
  if (arena) {
    const viaArena = nearestReachable(w, zoneCells(w, "arena", arena.id));
    if (viaArena) return viaArena;
  }
  const boss = w.bossId ? w.enemies.find((e) => e.id === w.bossId && e.alive) : undefined;
  if (boss) {
    const cell = w.grid.worldToCell(boss.pos.x, boss.pos.z);
    const viaBoss = nearestReachable(w, [cell, ...sidesOf(w, cell)]);
    if (viaBoss) return viaBoss;
  }
  return nearestReachable(w, zoneCells(w, "exit"));
}

function runPhase(phase: PhaseDef, seed: number): RunResult {
  const w = createWorld({ reg: registry, phaseId: phase.id, seed });
  const maxSteps = Math.round(phase.parTime * 60);
  let rescues = 0;
  let steps = 0;
  while (steps++ < maxSteps) {
    if (w.player.hp < w.player.maxHp * RESCUE_AT || w.status === "dead") {
      rescues++;
      w.player.alive = true;
      w.player.hp = w.player.maxHp;
      w.player.shield = w.player.maxShield;
      w.player.invuln = 1.5;
      w.status = "playing";
    }
    solveReachableTerminals(w, seed);

    // só engaja o que está à vista: atirar em parede travaria o bot no lugar
    const eye = eyePosition(w.player);
    const threats = w.enemies
      .filter((e) => e.alive && !e.disguised)
      .filter((e) => lineOfSight(w.grid, eye, targetCenter(e)));
    const target = threats.sort((a, b) =>
      Math.hypot(a.pos.x - w.player.pos.x, a.pos.z - w.player.pos.z) - Math.hypot(b.pos.x - w.player.pos.x, b.pos.z - w.player.pos.z))[0];
    const route = plan(w);

    let inp = input({ yaw: w.player.yaw, pitch: w.player.pitch });
    const active = w.player.weapons[w.player.active];
    const activeDef = active ? findWeaponDef(w.reg, active.defId) : null;
    if (active && activeDef && isAmmoWeapon(activeDef) && active.magazine === 0 && active.reserve !== 0 && !active.reloading) {
      inp = { ...inp, reload: true };
    }
    const dist = target ? Math.hypot(target.pos.x - w.player.pos.x, target.pos.z - w.player.pos.z) : Infinity;
    const step = route ? (route.path[1] ?? route.path[0]) : undefined;
    let move: { forward: number; yaw: number } | null = null;
    if (step) {
      const to = w.grid.cellToWorld(step);
      move = { forward: 1, yaw: Math.atan2(-(to.x - w.player.pos.x), -(to.z - w.player.pos.z)) };
    }
    if (needsScan(w)) {
      // varredura antes de atirar: revelado, o alvo passa a receber 2,5×
      inp = { ...inp, weaponSlot: 2, fire: true };
    } else if (target && dist < 18) {
      // mira no centro de colisão real (leva em conta o hover dos inimigos voadores)
      const aim = aimAt(w, targetCenter(target));
      // atira parado se está perto; avança atirando se está longe
      inp = input({ ...aim, fire: true, weaponSlot: bestSlot(w, target.def, refreshStatuses(w, target)), forward: dist > 3 && move ? 1 : 0 });
    } else if (move) {
      inp = input({ ...move, pitch: 0, sprint: true });
    }
    if (process.env.BOT_DEBUG && steps % 120 === 0) {
      console.log(
        `t=${w.time.toFixed(0)} pos=[${w.grid.worldToCell(w.player.pos.x, w.player.pos.z)}] obj=[${route?.goal ?? "-"}] path=${route?.path.length ?? 0} alvo=${target?.type ?? "-"}@${dist === Infinity ? "-" : dist.toFixed(1)} portas=${w.doors.map((d) => (d.open ? "A" : "F")).join("")} term=${w.terminals.map((t) => (t.solved ? "1" : "0")).join("")}`,
      );
    }
    stepWorld(w, inp);

    // o bot "combate" a arena parada: se a onda travou (inimigos presos), força a limpeza
    for (const a of w.arenas) {
      if (a.state === "active" && a.pending.length === 0 && a.alive.length === 0) {
        a.state = "cleared";
        for (const d of a.def.lockDoors ?? []) openDoor(w, d);
        applyEffects(w, a.def.onClear);
      }
    }
    if (w.exitOpen) break;
  }
  return {
    phaseId: phase.id,
    seed,
    completed: w.exitOpen,
    time: w.time,
    rescues,
    kills: w.stats.killsTotal,
    damageTaken: w.stats.damageTaken,
    terminalsSolved: w.stats.terminalsSolved,
  };
}

describe("balanceamento headless", () => {
  const results: RunResult[] = [];

  for (const phase of curriculum()) {
    it(`${phase.id}: concluível dentro do parTime e sem estourar os tetos`, () => {
      for (const seed of SEEDS) {
        const r = runPhase(phase, seed);
        results.push(r);
        expect(r.terminalsSolved, `${phase.id} seed ${seed}: terminais resolvidos`).toBe(phase.terminals.length);
        expect(r.completed, `${phase.id} seed ${seed}: saída liberada em ${r.time.toFixed(0)}s`).toBe(true);
        expect(r.time, `${phase.id} seed ${seed}: tempo acima do parTime`).toBeLessThanOrEqual(phase.parTime);
        expect(r.time, `${phase.id} seed ${seed}: abaixo do minTime do servidor`).toBeGreaterThan(0);
        expect(r.kills, `${phase.id} seed ${seed}: abates acima do teto de plausibilidade`).toBeLessThanOrEqual(phase.limits.maxKills);
      }
    });
  }

  it("resumo do balanceamento", () => {
    const byPhase = new Map<string, RunResult[]>();
    for (const r of results) byPhase.set(r.phaseId, [...(byPhase.get(r.phaseId) ?? []), r]);
    const lines = [...byPhase.entries()].map(([id, rs]) => {
      const avg = (f: (r: RunResult) => number): number => rs.reduce((a, r) => a + f(r), 0) / rs.length;
      const par = curriculum().find((p) => p.id === id)!.parTime;
      return `${id.padEnd(14)} tempo=${avg((r) => r.time).toFixed(0)}s (par ${par}s) resgates=${avg((r) => r.rescues).toFixed(1)} abates=${avg((r) => r.kills).toFixed(0)} dano=${avg((r) => r.damageTaken).toFixed(0)}`;
    });
    console.log(`\n${lines.join("\n")}`);
    expect(byPhase.size).toBe(curriculum().length);
  });
});
