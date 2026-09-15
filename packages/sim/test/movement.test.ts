import { describe, expect, it } from "vitest";
import { PLAYER_TUNING } from "../src";
import { makePhase, makeWorld, rows, run } from "./helpers";

const open = makePhase({
  layout: rows(
    "##########################",
    "#P.......................#",
    "#........................#",
    "#........................#",
    "##########################",
  ),
  legend: { P: { type: "player" } },
});

describe("movimento do jogador", () => {
  it("anda na velocidade de caminhada e para ao soltar", () => {
    const w = makeWorld(open);
    w.player.yaw = -Math.PI / 2; // olhando para +X
    const x0 = w.player.pos.x;
    run(w, 2, { forward: 1 });
    const v = Math.hypot(w.player.vel.x, w.player.vel.z);
    expect(v).toBeCloseTo(PLAYER_TUNING.walkSpeed, 1);
    expect(w.player.pos.x - x0).toBeGreaterThan(8);
    run(w, 1, {});
    expect(Math.hypot(w.player.vel.x, w.player.vel.z)).toBeLessThan(0.05);
  });

  it("sprint consome stamina, esgota e só volta após recuperar o limiar", () => {
    const w = makeWorld(open);
    w.player.yaw = -Math.PI / 2;
    run(w, 0.5, { forward: 1, sprint: true });
    expect(w.player.sprinting).toBe(true);
    expect(w.player.stamina).toBeLessThan(100);
    w.player.pos.x = 3;
    w.player.stamina = 1;
    run(w, 0.2, { forward: 1, sprint: true });
    expect(w.player.exhausted).toBe(true);
    expect(w.player.sprinting).toBe(false);
    run(w, 0.5, { forward: 0.01, sprint: true });
    expect(w.player.exhausted).toBe(true);
    run(w, 2.5, {});
    expect(w.player.exhausted).toBe(false);
  });

  it("pula e volta ao chão pela gravidade", () => {
    const w = makeWorld(open);
    run(w, 1 / 60, { jump: true });
    expect(w.player.onGround).toBe(false);
    run(w, 0.25, {});
    expect(w.player.pos.y).toBeGreaterThan(0.5);
    run(w, 1.5, {});
    expect(w.player.pos.y).toBe(0);
    expect(w.player.onGround).toBe(true);
  });

  it("não atravessa paredes", () => {
    const w = makeWorld(open);
    w.player.yaw = 0; // -Z: parede logo acima
    run(w, 2, { forward: 1 });
    expect(w.player.pos.z).toBeGreaterThanOrEqual(2 + w.player.radius - 1e-3);
  });
});
