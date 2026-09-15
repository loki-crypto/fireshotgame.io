import { isAmmoWeapon } from "../core/types";
import { emit, toast, type World } from "./world";

export function saveCheckpoint(w: World, reason: string): void {
  const p = w.player;
  w.checkpoint = {
    pos: { x: p.pos.x, y: 0, z: p.pos.z },
    yaw: p.yaw,
    hp: p.hp,
    shield: p.shield,
    magazines: p.weapons.map((ws) => ({ defId: ws.defId, magazine: ws.magazine, reserve: ws.reserve })),
    time: w.time,
    reason,
  };
  emit(w, { type: "checkpoint", reason });
}

export function manualBackup(w: World): void {
  if (!w.mods.backup || !w.backupAvailable || !w.player.alive || !w.player.onGround) return;
  w.backupAvailable = false;
  saveCheckpoint(w, "backup");
  toast(w, "Backup criado: você pode voltar a este ponto se cair.", "success");
}

/** Reaparece no último checkpoint. O mundo persiste; inimigos próximos voltam para casa. */
export function respawn(w: World): void {
  const p = w.player;
  const cp = w.checkpoint;
  const pos = cp ? cp.pos : w.playerStart.pos;
  p.pos = { ...pos };
  p.prevPos = { ...pos };
  p.vel = { x: 0, y: 0, z: 0 };
  p.yaw = cp ? cp.yaw : w.playerStart.yaw;
  p.hp = Math.max(cp ? cp.hp : p.maxHp, Math.round(p.maxHp * 0.6));
  p.shield = Math.max(cp ? cp.shield : p.maxShield, Math.round(p.maxShield * 0.5));
  p.stamina = p.maxStamina;
  p.alive = true;
  p.invuln = 2.5;
  p.shieldUp = false;
  if (cp) {
    for (const m of cp.magazines) {
      const ws = p.weapons.find((x) => x.defId === m.defId);
      const def = w.reg.weapons.find((d) => d.id === m.defId);
      if (!ws || !def) continue;
      if (isAmmoWeapon(def)) {
        ws.magazine = Math.max(ws.magazine, m.magazine);
        if (ws.reserve !== null && m.reserve !== null) ws.reserve = Math.max(ws.reserve, m.reserve);
      }
      ws.reloading = false;
    }
  }
  for (const e of w.enemies) {
    if (!e.alive || e.behavior === "ransomware") continue;
    if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < 14) {
      e.pos = { ...e.home };
      e.prevPos = { ...e.home };
      e.state = "patrol";
      e.stateTime = 0;
      e.path = [];
    }
  }
  w.projectiles = w.projectiles.filter((pr) => pr.owner === "player");
  w.status = "playing";
  w.stats.checkpointsUsed++;
  emit(w, { type: "player_respawned" });
}
