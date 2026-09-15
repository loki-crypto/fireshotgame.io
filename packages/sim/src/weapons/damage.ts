import type { EnemyDef, EnemyStatus, WeaponDef } from "../core/types";

export const COUNTER_STRONG = 2.5;
export const COUNTER_WEAK = 0.5;
export const COUNTER_NEUTRAL = 1;

export type CounterKind = "strong" | "neutral" | "weak";

/**
 * Núcleo do design (ameaça ↔ contramedida):
 *  - estado que torna a ameaça vulnerável (ex.: Rootkit revelado pelo Scanner) → ×2.5
 *  - estado que torna o ataque ineficaz (ex.: atirar em Rootkit oculto) → ×0.5
 *  - arma listada como contramedida correta → ×2.5
 *  - arma base (Patch Pistol) ou inimigo sem contramedida específica → ×1
 *  - qualquer outra arma especial (contramedida incorreta) → ×0.5
 * A tabela vive no JSON de inimigos; esta função só aplica as regras.
 */
export function counterKind(weapon: WeaponDef, enemy: EnemyDef, statuses: ReadonlySet<EnemyStatus>): CounterKind {
  const c = enemy.counters;
  if (c.weakWhen?.some((s) => statuses.has(s))) return "weak";
  if (c.strongWhen?.some((s) => statuses.has(s))) return "strong";
  if (c.strong.includes(weapon.id)) return "strong";
  if (weapon.base || c.anyWeaponNeutral) return "neutral";
  return "weak";
}

export const counterMultiplier = (k: CounterKind): number =>
  k === "strong" ? COUNTER_STRONG : k === "weak" ? COUNTER_WEAK : COUNTER_NEUTRAL;

export function computeDamage(
  base: number,
  weapon: WeaponDef,
  enemy: EnemyDef,
  statuses: ReadonlySet<EnemyStatus>,
  damageMult: number,
): { damage: number; counter: CounterKind } {
  const counter = counterKind(weapon, enemy, statuses);
  let damage = base * counterMultiplier(counter) * damageMult;
  const armor = typeof enemy.special?.armor === "number" ? enemy.special.armor : 0;
  if (statuses.has("armored") && armor > 0) damage *= 1 - armor;
  return { damage, counter };
}
