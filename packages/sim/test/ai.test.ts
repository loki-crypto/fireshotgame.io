import { describe, expect, it } from "vitest";
import { spawnEnemy } from "../src";
import { makePhase, makeWorld, rows, run } from "./helpers";

const arena = makePhase({
  layout: rows(
    "####################",
    "#P.................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################",
  ),
  legend: { P: { type: "player" } },
});

describe("IA: máquina de estados", () => {
  it("patrulha → alerta → perseguição → ataque quando vê o jogador", () => {
    const w = makeWorld(arena);
    const e = spawnEnemy(w, "worm", { x: 12, y: 0, z: 5 }, { reason: "effect" });
    e.def = { ...e.def, special: { replicateEvery: 9999, replicaCap: 1 } };
    e.data.replicateAt = 9999;
    expect(e.state).toBe("patrol");
    const states = new Set<string>();
    run(w, 6, () => { states.add(e.state); return {}; });
    expect(states.has("alert")).toBe(true);
    expect(states.has("chase")).toBe(true);
    expect(states.has("attack")).toBe(true);
    expect(w.player.hp + w.player.shield).toBeLessThan(150);
  });

  it("fica em patrulha quando o jogador está fora do raio de alerta", () => {
    const w = makeWorld(makePhase({
      layout: rows(
        "##############################",
        "#P...........................#",
        "##############################",
      ),
      legend: { P: { type: "player" } },
    }));
    const e = spawnEnemy(w, "worm", { x: 57, y: 0, z: 3 }, { reason: "effect" });
    e.data.replicateAt = 9999;
    run(w, 2);
    expect(e.state).toBe("patrol");
  });

  it("perde o jogador quando ele se afasta além do raio de perda", () => {
    const w = makeWorld(arena);
    const e = spawnEnemy(w, "worm", { x: 20, y: 0, z: 7 }, { reason: "effect" });
    e.data.replicateAt = 9999;
    e.state = "chase";
    w.player.pos = { x: 200, y: 0, z: 7 }; // fora do mapa, só para teste de distância
    run(w, 0.1);
    expect(e.state).toBe("patrol");
  });

  it("levar dano acorda o inimigo em patrulha", () => {
    const w = makeWorld(arena);
    const e = spawnEnemy(w, "worm", { x: 35, y: 0, z: 11 }, { reason: "effect" });
    e.data.replicateAt = 9999;
    w.player.yaw = Math.atan2(-(35 - 3), -(11 - 3));
    w.player.pitch = Math.asin((0.45 - 1.6) / Math.hypot(32, 8, 1.15));
    run(w, 0.05, { fire: true });
    expect(["alert", "chase"]).toContain(e.state);
  });

  it("inimigo à distância usa projéteis (ranged)", () => {
    const w = makeWorld(arena);
    const e = spawnEnemy(w, "mitm", { x: 20, y: 0, z: 5 }, { reason: "effect" });
    e.state = "chase";
    let fired = false;
    run(w, 3, () => { if (w.projectiles.some((p) => p.owner === "enemy")) fired = true; return {}; });
    expect(fired).toBe(true);
  });
});
