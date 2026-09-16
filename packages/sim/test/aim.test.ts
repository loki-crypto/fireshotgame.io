import { describe, expect, it } from "vitest";
import { damagePlayer, PLAYER_TUNING, stepPlayerWeapons, stepWorld } from "../src";
import { drain, input, makePhase, makeWorld, rows } from "./helpers";

const phase = makePhase({
  layout: rows(
    "###############",
    "#P............#",
    "#.............#",
    "#.............#",
    "###############",
  ),
  legend: { P: { type: "player" } },
  weaponsAvailable: ["patch_pistol", "scanner", "vpn_shield", "firewall_cannon", "sanitizer"],
});

const hold = (over: Record<string, unknown> = {}) => input({ aim: true, ...over });

describe("mira apurada", () => {
  it("liga e desliga com o botão, emitindo evento para o áudio", () => {
    const w = makeWorld(phase, 1);
    expect(w.player.aiming).toBe(false);

    stepWorld(w, hold());
    expect(w.player.aiming).toBe(true);
    expect(drain(w).filter((e) => e.type === "aim")).toEqual([{ type: "aim", on: true }]);

    stepWorld(w, hold());
    expect(drain(w).some((e) => e.type === "aim"), "sem repetir o evento enquanto segura").toBe(false);

    stepWorld(w, input());
    expect(w.player.aiming).toBe(false);
    expect(drain(w).filter((e) => e.type === "aim")).toEqual([{ type: "aim", on: false }]);
  });

  it("vale para todas as armas da fase", () => {
    for (let slot = 1; slot <= 5; slot++) {
      const w = makeWorld(phase, 1);
      stepWorld(w, input({ weaponSlot: slot }));
      stepWorld(w, hold());
      const weapon = w.player.weapons[w.player.active]!.defId;
      expect(w.player.aiming, `arma ${weapon} deveria permitir mirar`).toBe(true);
    }
  });

  it("encurta o passo e cancela a corrida", () => {
    // yaw = -π/2 aponta para +x: o corredor tem 30 unidades nessa direção
    const east = { yaw: -Math.PI / 2, pitch: 0 };
    const walk = makeWorld(phase, 1);
    const aim = makeWorld(phase, 1);
    for (let i = 0; i < 60; i++) {
      stepWorld(walk, input({ forward: 1, sprint: true, ...east }));
      stepWorld(aim, hold({ forward: 1, sprint: true, ...east }));
    }
    expect(walk.player.sprinting).toBe(true);
    expect(aim.player.sprinting, "mirar cancela a corrida").toBe(false);

    const dWalk = walk.player.pos.x - walk.playerStart.pos.x;
    const dAim = aim.player.pos.x - aim.playerStart.pos.x;
    expect(dWalk).toBeGreaterThan(5);
    expect(dAim).toBeLessThan(dWalk * 0.5);
    expect(PLAYER_TUNING.aimSpeedMult).toBeLessThan(1);
  });

  it("reduz a dispersão do tiro (mais tiros no eixo da câmera)", () => {
    const spreadOf = (aiming: boolean): number => {
      const w = makeWorld(phase, 7);
      w.player.pitch = 0;
      let worst = 0;
      for (let i = 0; i < 400; i++) {
        stepWorld(w, aiming ? hold({ fire: true, yaw: 0, pitch: 0 }) : input({ fire: true, yaw: 0, pitch: 0 }));
        for (const ev of drain(w)) {
          if (ev.type !== "shot") continue;
          const dx = ev.end.x - ev.origin.x;
          const dz = ev.end.z - ev.origin.z;
          worst = Math.max(worst, Math.abs(Math.atan2(dx, -dz)));
        }
      }
      return worst;
    };
    const hip = spreadOf(false);
    const ads = spreadOf(true);
    expect(hip).toBeGreaterThan(0);
    expect(ads).toBeLessThan(hip * 0.5);
  });

  it("não mira no ar (pulando, a arma sai do ombro)", () => {
    const w = makeWorld(phase, 1);
    stepWorld(w, hold());
    expect(w.player.aiming).toBe(true);

    stepWorld(w, hold({ jump: true }));
    stepWorld(w, hold());
    expect(w.player.onGround, "deveria estar no ar depois do pulo").toBe(false);
    expect(w.player.aiming).toBe(false);

    // ao tocar o chão a mira volta sozinha (o botão continua pressionado)
    for (let i = 0; i < 120 && !w.player.onGround; i++) stepWorld(w, hold());
    expect(w.player.onGround).toBe(true);
    expect(w.player.aiming).toBe(true);
  });

  it("morrer solta a mira", () => {
    const w = makeWorld(phase, 1);
    stepWorld(w, hold());
    expect(w.player.aiming).toBe(true);
    w.player.shield = 0;
    damagePlayer(w, 9999, null, "worm", "effect");
    expect(w.player.alive).toBe(false);
    stepPlayerWeapons(w, hold(), 1 / 60);
    expect(w.player.aiming).toBe(false);
  });
});
