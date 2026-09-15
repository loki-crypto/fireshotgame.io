import { isAmmoWeapon, type WeaponDef } from "../core/types";
import type { SimEvent } from "../core/events";
import type { Modifiers } from "../progression/modifiers";

export interface WeaponState {
  defId: string;
  magazine: number;
  /** null = reserva infinita */
  reserve: number | null;
  energy: number;
  cooldown: number;
  reloading: boolean;
  reloadTimer: number;
  /** travada pela criptografia do Ransomware */
  locked: boolean;
  pulseTimer: number;
}

export function magazineSize(def: WeaponDef, mods: Modifiers): number {
  return isAmmoWeapon(def) ? Math.max(1, Math.round(def.magazine * mods.magazineMult)) : 0;
}

export function createWeaponState(def: WeaponDef, mods: Modifiers): WeaponState {
  if (isAmmoWeapon(def)) {
    return {
      defId: def.id, magazine: magazineSize(def, mods),
      reserve: def.reserveMax === null ? null : Math.min(def.reserveMax, def.reserveStart ?? def.reserveMax),
      energy: 0, cooldown: 0, reloading: false, reloadTimer: 0, locked: false, pulseTimer: 0,
    };
  }
  return { defId: def.id, magazine: 0, reserve: null, energy: def.energyMax, cooldown: 0, reloading: false, reloadTimer: 0, locked: false, pulseTimer: 0 };
}

/** Avança temporizadores (cadência, recarga, regeneração de energia). */
export function tickWeapon(w: WeaponState, def: WeaponDef, mods: Modifiers, dt: number, inUse: boolean, events: SimEvent[]): void {
  // permite leve saldo negativo (até um passo) para manter a cadência média exata com passo fixo
  w.cooldown = Math.max(-dt, w.cooldown - dt);
  if (isAmmoWeapon(def)) {
    const cap = magazineSize(def, mods);
    if (w.magazine > cap) w.magazine = cap;
    if (w.reloading) {
      w.reloadTimer -= dt;
      if (w.reloadTimer <= 0) {
        const need = cap - w.magazine;
        if (w.reserve === null) w.magazine = cap;
        else {
          const take = Math.min(need, w.reserve);
          w.magazine += take;
          w.reserve -= take;
        }
        w.reloading = false;
        events.push({ type: "reload_done", weaponId: def.id });
      }
    }
  } else if (!inUse) {
    w.energy = Math.min(def.energyMax, w.energy + def.energyRegen * dt);
  }
}

export function canFire(w: WeaponState, def: WeaponDef): boolean {
  if (w.locked || w.cooldown > 1e-9) return false;
  if (isAmmoWeapon(def)) return !w.reloading && w.magazine > 0;
  if (def.kind === "scanner") return w.energy >= def.energyCost;
  return w.energy > 0;
}

export function startReload(w: WeaponState, def: WeaponDef, mods: Modifiers, events: SimEvent[]): boolean {
  if (!isAmmoWeapon(def) || w.locked) return false;
  if (w.reloading || w.magazine >= magazineSize(def, mods)) return false;
  if (w.reserve !== null && w.reserve <= 0) return false;
  w.reloading = true;
  w.reloadTimer = def.reloadSeconds * mods.reloadMult;
  events.push({ type: "reload_start", weaponId: def.id });
  return true;
}

/** Adiciona munição de reserva equivalente a `magazines` pentes. Retorna quanto entrou. */
export function addReserve(w: WeaponState, def: WeaponDef, magazines: number): number {
  if (!isAmmoWeapon(def) || w.reserve === null || def.reserveMax === null) return 0;
  const before = w.reserve;
  w.reserve = Math.min(def.reserveMax, w.reserve + Math.ceil(def.magazine * magazines));
  return w.reserve - before;
}
