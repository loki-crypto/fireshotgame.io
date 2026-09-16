import type { UpgradeDef } from "@fireshot/sim";

/** Slots de upgrade por nível — espelho de `upgrade_slots` em apps/api/app/services/xp.py. */
export const upgradeSlots = (level: number): number => 1 + Math.floor(level / 2);

export interface NextUnlock {
  level: number;
  slot: boolean;
  upgrades: UpgradeDef[];
}

/** O próximo nível que libera algo (slot novo ou upgrade), procurando até `horizon` níveis à frente. */
export function nextUnlock(level: number, upgrades: UpgradeDef[], horizon = 10): NextUnlock | null {
  for (let next = level + 1; next <= level + horizon; next++) {
    const slot = upgradeSlots(next) > upgradeSlots(next - 1);
    const unlocked = upgrades.filter((u) => u.requiresLevel === next);
    if (slot || unlocked.length) return { level: next, slot, upgrades: unlocked };
  }
  return null;
}
