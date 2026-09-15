import { CELL_DOOR, CELL_FLOOR } from "../core/grid";
import type { EffectDef } from "../core/types";
import { addPickup } from "../phase/pickups";
import { spawnEnemy } from "./spawn";
import { emit, setFlag, toast, type World } from "./world";

export function openDoor(w: World, id: string): void {
  const d = w.doors.find((x) => x.id === id);
  if (!d || d.open) return;
  d.open = true;
  for (const [c, r] of d.cells) w.grid.set(c, r, CELL_FLOOR);
  emit(w, { type: "door_opened", doorId: id });
}

/** Fecha a porta se nada estiver ocupando suas células. Retorna se fechou. */
export function closeDoor(w: World, id: string): boolean {
  const d = w.doors.find((x) => x.id === id);
  if (!d || !d.open) return false;
  const occupied = d.cells.some(([c, r]) => {
    const inCell = (x: number, z: number, rad: number): boolean => {
      const cs = w.grid.cellSize;
      return x + rad > c * cs && x - rad < (c + 1) * cs && z + rad > r * cs && z - rad < (r + 1) * cs;
    };
    if (inCell(w.player.pos.x, w.player.pos.z, w.player.radius)) return true;
    return w.enemies.some((e) => e.alive && inCell(e.pos.x, e.pos.z, e.radius));
  });
  if (occupied) return false;
  d.open = false;
  for (const [c, r] of d.cells) w.grid.set(c, r, CELL_DOOR);
  emit(w, { type: "door_closed", doorId: id });
  return true;
}

export function applyEffects(w: World, effects: readonly EffectDef[]): void {
  for (const eff of effects) {
    switch (eff.type) {
      case "openDoor": openDoor(w, eff.door); break;
      case "closeDoor": closeDoor(w, eff.door); break;
      case "disableSpawner": {
        const s = w.spawners.find((x) => x.id === eff.spawner);
        if (s) s.active = false;
        break;
      }
      case "enableSpawner": {
        const s = w.spawners.find((x) => x.id === eff.spawner);
        if (s) { s.active = true; s.timer = 0; }
        break;
      }
      case "setFlag": setFlag(w, eff.flag); break;
      case "message": toast(w, eff.text, eff.tone ?? "info"); break;
      case "spawnPickups": {
        const s = w.spawners.find((x) => x.id === eff.spawner);
        if (!s) break;
        for (let i = 0; i < eff.count; i++) {
          const ang = (i / Math.max(1, eff.count)) * Math.PI * 2;
          const pos = { x: s.pos.x + Math.cos(ang) * 0.8 * Math.min(1, i), y: 0, z: s.pos.z + Math.sin(ang) * 0.8 * Math.min(1, i) };
          addPickup(w, eff.kind, pos, { amount: eff.amount, source: "effect" });
        }
        break;
      }
      case "spawnEnemies": {
        const s = w.spawners.find((x) => x.id === eff.spawner);
        if (!s) break;
        for (let i = 0; i < eff.count; i++) {
          const e = spawnEnemy(w, eff.enemy, s.pos, { reason: "effect", spawnerId: s.id });
          e.state = "chase";
        }
        break;
      }
      case "applyFirewallRules": {
        if (w.pendingFirewall) {
          w.firewall = w.pendingFirewall;
          w.pendingFirewall = null;
          toast(w, "Regras de firewall aplicadas: tráfego negado não entra mais na arena.", "success");
        }
        break;
      }
    }
  }
}
