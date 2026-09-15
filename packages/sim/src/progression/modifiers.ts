import type { UpgradeDef } from "../core/types";

export interface Modifiers {
  damageMult: number;
  magazineMult: number;
  reloadMult: number;
  scannerDurationMult: number;
  maxHpAdd: number;
  maxShieldAdd: number;
  shieldRegen: number;
  mfa: boolean;
  hints: boolean;
  radar: boolean;
  backup: boolean;
}

export const baseModifiers = (): Modifiers => ({
  damageMult: 1, magazineMult: 1, reloadMult: 1, scannerDurationMult: 1,
  maxHpAdd: 0, maxShieldAdd: 0, shieldRegen: 0,
  mfa: false, hints: false, radar: false, backup: false,
});

/** Calcula os modificadores a partir dos upgrades equipados (ordem irrelevante). */
export function computeModifiers(defs: readonly UpgradeDef[], equipped: readonly string[]): Modifiers {
  const m = baseModifiers();
  for (const id of equipped) {
    const def = defs.find((d) => d.id === id);
    if (!def) continue;
    for (const eff of def.effects) {
      if ("flag" in eff) {
        m[eff.flag] = true;
      } else if (eff.op === "mul") {
        m[eff.stat] *= eff.value;
      } else {
        const key = eff.stat === "maxHp" ? "maxHpAdd" : eff.stat === "maxShield" ? "maxShieldAdd" : "shieldRegen";
        m[key] += eff.value;
      }
    }
  }
  return m;
}

/** Slots de upgrade liberados pelo nível. */
export const upgradeSlots = (level: number): number => 1 + Math.floor(level / 2);
