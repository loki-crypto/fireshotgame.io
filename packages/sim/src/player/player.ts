import type { Vec3 } from "../core/vec";
import type { WeaponState } from "../weapons/weapon";

export interface PlayerInput {
  /** -1..1 (frente positivo) */
  forward: number;
  /** -1..1 (direita positivo) */
  strafe: number;
  jump: boolean;
  sprint: boolean;
  /** gatilho pressionado (mantido) */
  fire: boolean;
  /** mira apurada pressionada (mantida) — vale para todas as armas */
  aim: boolean;
  /** borda: recarregar */
  reload: boolean;
  /** 1..5 para selecionar arma; 0 = sem troca */
  weaponSlot: number;
  /** roda do mouse: -1, 0, 1 */
  weaponCycle: number;
  /** borda: denunciar mensagem suspeita / recusar resgate */
  report: boolean;
  /** borda: criar checkpoint manual (upgrade Backup) */
  backup: boolean;
  yaw: number;
  pitch: number;
}

export const emptyInput = (): PlayerInput => ({
  forward: 0, strafe: 0, jump: false, sprint: false, fire: false, aim: false, reload: false,
  weaponSlot: 0, weaponCycle: 0, report: false, backup: false, yaw: 0, pitch: 0,
});

export interface Player {
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  radius: number;
  eyeHeight: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  stamina: number;
  maxStamina: number;
  exhausted: boolean;
  weapons: WeaponState[];
  active: number;
  alive: boolean;
  invuln: number;
  lastDamageAt: number;
  shieldUp: boolean;
  saturated: boolean;
  sprinting: boolean;
  moving: boolean;
  /** mira apurada ativa (dispersão menor, passo mais curto) */
  aiming: boolean;
}

export const PLAYER_TUNING = {
  walkSpeed: 5.2,
  sprintSpeed: 8.2,
  accel: 14,
  airControl: 0.35,
  gravity: -22,
  jumpVelocity: 7.2,
  staminaDrain: 24,
  staminaRegen: 16,
  staminaRecover: 30,
  baseHp: 100,
  baseShield: 50,
  saturatedSpeedMult: 0.55,
  shieldRegenDelay: 4,
  /** mirando: passo mais curto, em troca da precisão */
  aimSpeedMult: 0.5,
  /** dispersão do tiro enquanto mira (fração da dispersão de quadril) */
  aimSpreadMult: 0.22,
} as const;

export function createPlayer(pos: Vec3, yaw: number, weapons: WeaponState[], maxHp: number, maxShield: number): Player {
  return {
    pos: { ...pos }, prevPos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, onGround: true,
    radius: 0.35, eyeHeight: 1.6,
    hp: maxHp, maxHp, shield: maxShield, maxShield,
    stamina: 100, maxStamina: 100, exhausted: false,
    weapons, active: 0, alive: true, invuln: 0, lastDamageAt: -999,
    shieldUp: false, aiming: false, saturated: false, sprinting: false, moving: false,
  };
}

export const eyePosition = (p: Player): Vec3 => ({ x: p.pos.x, y: p.pos.y + p.eyeHeight, z: p.pos.z });
