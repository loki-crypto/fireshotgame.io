import { describe, expect, it } from "vitest";
import { registry } from "@fireshot/content";
import {
  applyTerminalResult, createWorld, currentObjective, damagePlayer, phaseSummary, respawn, spawnEnemy, stepWorld, emptyInput,
  terminalAccess,
} from "../src";
import { drain, makePhase, makeWorld, rows, run } from "./helpers";

const flow = () => makePhase({
  layout: rows(
    "##############",
    "#P....#......#",
    "#.....#..s...#",
    "#..T..a..AAA.#",
    "#.....#..AAA.#",
    "#.....#....X.#",
    "##############",
  ),
  legend: {
    P: { type: "player" }, T: { type: "terminal", id: "t1" }, a: { type: "door", id: "d1" },
    s: { type: "spawner", id: "s1" }, A: { type: "arena", id: "a1" }, X: { type: "exit" },
  },
  terminals: [{ id: "t1", title: "Tabela ARP", concept: "IP/MAC", generator: "x", challenges: 2, required: true, onSolve: [{ type: "openDoor", door: "d1" }] }],
  arenas: [{ id: "a1", title: "Contenção", lockDoors: ["d1"], waves: [{ spawns: [{ spawner: "s1", enemy: "worm", count: 2, interval: 0.2 }] }], onClear: [] }],
  exit: { requires: { terminals: ["t1"], arenas: ["a1"] } },
});

describe("mundo e fluxo de fase", () => {
  it("carrega o laboratório (sala de teste) do conteúdo", () => {
    const w = createWorld({ reg: registry, phaseId: "lab", seed: 99 });
    expect(w.enemies.length).toBe(1);
    expect(w.pickups.length).toBe(2);
    stepWorld(w, { ...emptyInput(), yaw: w.player.yaw });
    expect(w.status).toBe("playing");
  });

  it("glifo desconhecido gera erro de conteúdo", () => {
    const bad = makePhase({ layout: rows("###", "#PZ", "###"), legend: { P: { type: "player" } } });
    expect(() => makeWorld(bad)).toThrow(/glyph 'Z'/);
  });

  it("terminal com 2 desafios: erro zera primeira tentativa; resolver abre porta e salva checkpoint", () => {
    const w = makeWorld(flow());
    expect(currentObjective(w)).toEqual({ key: "objective.terminal", params: { title: "Tabela ARP" } });
    const acc = terminalAccess(w, "t1");
    expect(acc.ok && acc.challengeIndex === 0 && acc.attemptNo === 1).toBe(true);
    applyTerminalResult(w, "t1", false, false);
    const acc2 = terminalAccess(w, "t1");
    expect(acc2.ok && acc2.attemptNo === 2).toBe(true);
    expect(applyTerminalResult(w, "t1", true, false).solvedTerminal).toBe(false);
    const out = applyTerminalResult(w, "t1", true, false);
    expect(out.solvedTerminal).toBe(true);
    expect(out.firstTryTerminal).toBe(false);
    expect(w.doors[0]!.open).toBe(true);
    expect(w.grid.isWalkable(6, 3)).toBe(true);
    expect(w.checkpoint!.reason).toBe("terminal");
    expect(terminalAccess(w, "t1")).toEqual({ ok: false, reason: "solved" });
  });

  it("arena: entra, porta fecha, ondas surgem; limpar abre porta e libera saída", () => {
    const w = makeWorld(flow());
    applyTerminalResult(w, "t1", true, false);
    applyTerminalResult(w, "t1", true, false);
    w.player.pos = { x: 19, y: 0, z: 7 };
    run(w, 1 / 60);
    expect(w.arenas[0]!.state).toBe("active");
    expect(w.doors[0]!.open).toBe(false);
    run(w, 1);
    const worms = w.enemies.filter((e) => e.alive && e.arenaId === "a1");
    expect(worms.length).toBe(2);
    for (const e of worms) e.alive = false;
    run(w, 3);
    expect(w.arenas[0]!.state).toBe("cleared");
    expect(w.doors[0]!.open).toBe(true);
    expect(w.exitOpen).toBe(true);
    w.player.pos = { x: 23, y: 0, z: 11 };
    run(w, 1 / 60);
    expect(w.status).toBe("complete");
    expect(drain(w).some((e) => e.type === "phase_complete")).toBe(true);
  });

  it("morte registra causa, e respawn no checkpoint devolve controle com invulnerabilidade", () => {
    const w = makeWorld(flow());
    const e = spawnEnemy(w, "worm", { x: 5, y: 0, z: 3 }, { reason: "effect" });
    damagePlayer(w, 500, e.pos, "worm", "melee");
    expect(w.status).toBe("dead");
    expect(w.deathCause).toBe("worm");
    expect(w.stats.deaths).toBe(1);
    expect(w.outbox.some((ev) => ev.type === "player_died")).toBe(true);
    respawn(w);
    expect(w.status).toBe("playing");
    expect(w.player.alive).toBe(true);
    expect(w.player.invuln).toBeGreaterThan(0);
    expect(w.player.hp).toBeGreaterThanOrEqual(60);
  });

  it("MFA (upgrade) evita a primeira morte da fase", () => {
    const w = makeWorld(flow(), 1, ["def_integrity_1", "def_shield_1", "def_mfa"]);
    damagePlayer(w, 1000, null, "worm", "melee");
    expect(w.status).toBe("playing");
    expect(w.stats.mfaUsed).toBe(true);
    w.player.invuln = 0;
    damagePlayer(w, 1000, null, "worm", "melee");
    expect(w.status).toBe("dead");
  });

  it("escudo absorve dano antes da integridade", () => {
    const w = makeWorld(flow());
    damagePlayer(w, 30, null, "worm", "melee");
    expect(w.player.shield).toBe(20);
    expect(w.player.hp).toBe(100);
    damagePlayer(w, 30, null, "worm", "melee");
    expect(w.player.shield).toBe(0);
    expect(w.player.hp).toBe(90);
  });

  it("resumo da fase calcula flags para badges", () => {
    const w = makeWorld(flow());
    const s = phaseSummary(w);
    expect(s.flags).toEqual({ noDeath: true, onlyBaseWeapon: true, noFakePickups: true, noMitmInterference: true });
  });

  it("simulação é determinística para a mesma seed e mesmas entradas", () => {
    const mk = () => {
      const w = createWorld({ reg: registry, phaseId: "lab", seed: 5 });
      for (let i = 0; i < 600; i++) {
        stepWorld(w, { ...emptyInput(), forward: i % 120 < 60 ? 1 : 0, strafe: i % 90 < 45 ? 1 : -1, fire: i % 7 === 0, yaw: i * 0.01, pitch: -0.1 });
      }
      return JSON.stringify({ p: w.player.pos, e: w.enemies.map((e) => [e.pos, e.hp, e.state]), t: w.time, s: w.stats });
    };
    expect(mk()).toBe(mk());
  });
});
