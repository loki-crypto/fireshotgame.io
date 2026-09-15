import type { EnemyStatus } from "../../core/types";
import type { Enemy } from "../../world/entities";
import type { World } from "../../world/world";

/** Ganchos de comportamento. `update` retorna true se assumiu o controle (pula a FSM padrão). */
export interface Behavior {
  onSpawn?(w: World, e: Enemy): void;
  update?(w: World, e: Enemy, dt: number): boolean;
  statuses?(w: World, e: Enemy, out: Set<EnemyStatus>): void;
  onDamaged?(w: World, e: Enemy, amount: number, weaponId: string): void;
  onDeath?(w: World, e: Enemy, weaponId: string): void;
  onRevealed?(w: World, e: Enemy): void;
  /** multiplicador de velocidade aplicado à FSM padrão */
  speedMult?(w: World, e: Enemy): number;
}
