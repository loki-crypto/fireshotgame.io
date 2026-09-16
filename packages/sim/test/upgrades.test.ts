import { describe, expect, it } from "vitest";
import { registry } from "@fireshot/content";
import { baseModifiers, computeModifiers, damagePlayer, findWeaponDef, isAmmoWeapon, manualBackup, upgradeSlots } from "../src";
import { drain, makePhase, makeWorld, rows } from "./helpers";

const phase = makePhase({
  layout: rows(
    "#######",
    "#P....#",
    "#.....#",
    "#######",
  ),
  legend: { P: { type: "player" } },
});

describe("modificadores de upgrade", () => {
  it("sem upgrades equipados usa os valores base", () => {
    expect(computeModifiers(registry.upgrades, [])).toEqual(baseModifiers());
  });

  it("acumula multiplicadores e somas, e ignora ids desconhecidos", () => {
    const m = computeModifiers(registry.upgrades, ["off_damage_1", "off_damage_2", "def_integrity_1", "nao-existe"]);
    expect(m.damageMult).toBeCloseTo(1.1 * 1.15, 10);
    expect(m.maxHpAdd).toBe(20);
    expect(m.reloadMult).toBe(1);
  });

  it("flags ligam recursos", () => {
    const m = computeModifiers(registry.upgrades, ["def_mfa", "ana_hints", "ana_radar", "ana_backup"]);
    expect([m.mfa, m.hints, m.radar, m.backup]).toEqual([true, true, true, true]);
  });

  it("slots liberados pelo nível", () => {
    expect([1, 2, 3, 4, 9, 10].map(upgradeSlots)).toEqual([1, 2, 2, 3, 5, 6]);
  });
});

describe("efeitos no mundo", () => {
  it("defesa aumenta integridade e escudo máximos", () => {
    const plain = makeWorld(phase, 1, []);
    const armored = makeWorld(phase, 1, ["def_integrity_1", "def_shield_1"]);
    expect(armored.player.maxHp).toBe(plain.player.maxHp + 20);
    expect(armored.player.maxShield).toBe(plain.player.maxShield + 25);
    expect(armored.player.hp).toBe(armored.player.maxHp);
  });

  it("ofensiva aumenta o pente e reduz o tempo de recarga", () => {
    const plain = makeWorld(phase, 1, []);
    const tuned = makeWorld(phase, 1, ["off_magazine_1", "off_reload_1"]);
    const def = findWeaponDef(plain.reg, "patch_pistol");
    const baseMagazine = isAmmoWeapon(def) ? def.magazine : 0;
    expect(tuned.player.weapons[0]!.magazine).toBe(Math.round(baseMagazine * 1.25));
    expect(tuned.player.weapons[0]!.magazine).toBeGreaterThan(plain.player.weapons[0]!.magazine);
    expect(tuned.mods.reloadMult).toBe(0.8);
  });

  it("MFA dá uma segunda chance por fase", () => {
    const w = makeWorld(phase, 1, ["def_mfa"]);
    w.player.shield = 0;
    damagePlayer(w, 9999, null, "worm", "effect");
    expect(w.player.alive).toBe(true);
    expect(w.player.hp).toBe(Math.round(w.player.maxHp * 0.35));
    expect(w.mfaAvailable).toBe(false);
    expect(drain(w).some((e) => e.type === "mfa_saved")).toBe(true);
    expect(w.stats.deaths).toBe(0);

    w.player.invuln = 0;
    w.player.shield = 0;
    damagePlayer(w, 9999, null, "worm", "effect");
    expect(w.player.alive).toBe(false);
    expect(w.stats.deaths).toBe(1);
  });

  it("sem MFA a morte é imediata", () => {
    const w = makeWorld(phase, 1, []);
    w.player.shield = 0;
    damagePlayer(w, 9999, null, "worm", "effect");
    expect(w.player.alive).toBe(false);
    expect(w.status).toBe("dead");
  });

  it("Backup cria um checkpoint manual, uma vez por fase", () => {
    const w = makeWorld(phase, 1, ["ana_backup"]);
    w.player.onGround = true;
    expect(w.checkpoint?.reason).toBe("start");
    manualBackup(w);
    expect(w.checkpoint?.reason).toBe("backup");
    expect(w.backupAvailable).toBe(false);
    w.time = 30;
    manualBackup(w);
    expect(w.checkpoint?.time).toBe(0);  // o segundo backup não sobrescreve
  });

  it("Backup não funciona sem o upgrade equipado", () => {
    const w = makeWorld(phase, 1, []);
    w.player.onGround = true;
    manualBackup(w);
    expect(w.checkpoint?.reason).toBe("start");
    expect(w.backupAvailable).toBe(true);
  });
});
