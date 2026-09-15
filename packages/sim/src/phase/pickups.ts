import type { PickupKind } from "../core/types";
import { isAmmoWeapon } from "../core/types";
import type { Vec3 } from "../core/vec";
import { damagePlayer } from "../world/combat";
import { decryptPlayer } from "../world/encryption";
import type { Pickup } from "../world/entities";
import { emit, newId, record, toast, type World } from "../world/world";
import { addReserve } from "../weapons/weapon";

export const PICKUP_DEFAULTS: Record<PickupKind, number> = {
  ammo: 1, health: 25, shield: 25, bytes: 5, backup: 1, energy: 50,
};

export function addPickup(w: World, kind: PickupKind, pos: Vec3, opts: Partial<Pick<Pickup, "amount" | "fake" | "source" | "messageId">> = {}): Pickup {
  const k: Pickup = {
    id: newId(w, "k"), kind, amount: opts.amount ?? PICKUP_DEFAULTS[kind], pos: { x: pos.x, y: 0, z: pos.z },
    active: true, fake: opts.fake ?? false, revealed: false, source: opts.source ?? "effect", messageId: opts.messageId ?? null,
  };
  w.pickups.push(k);
  return k;
}

/** Efeito de um pickup legítimo. Retorna false se não teve efeito (ex.: vida cheia) e deve permanecer. */
function applyPickup(w: World, k: Pickup): boolean {
  const p = w.player;
  switch (k.kind) {
    case "health":
      if (p.hp >= p.maxHp) return false;
      p.hp = Math.min(p.maxHp, p.hp + k.amount);
      return true;
    case "shield":
      if (p.shield >= p.maxShield) return false;
      p.shield = Math.min(p.maxShield, p.shield + k.amount);
      return true;
    case "ammo": {
      let added = 0;
      for (const ws of p.weapons) {
        const def = w.reg.weapons.find((d) => d.id === ws.defId);
        if (def && isAmmoWeapon(def)) added += addReserve(ws, def, k.amount);
      }
      return added > 0;
    }
    case "energy": {
      let added = false;
      for (const ws of p.weapons) {
        const def = w.reg.weapons.find((d) => d.id === ws.defId);
        if (def && !isAmmoWeapon(def) && ws.energy < def.energyMax) {
          ws.energy = Math.min(def.energyMax, ws.energy + k.amount);
          added = true;
        }
      }
      return added;
    }
    case "bytes":
      w.sessionBytes += k.amount;
      w.stats.bytesCollected += k.amount;
      return true;
    case "backup":
      if (w.encryptedUntil > w.time) {
        decryptPlayer(w);
        toast(w, "Backup restaurado: upgrades recuperados sem pagar resgate.", "success");
      } else {
        p.shield = Math.min(p.maxShield, p.shield + 25);
      }
      return true;
  }
}

function triggerTrap(w: World, k: Pickup): void {
  w.stats.fakePickups++;
  damagePlayer(w, 15, { ...k.pos }, "phishing", "effect");
  w.player.shield = 0;
  const lost = Math.min(w.sessionBytes, 10);
  w.sessionBytes -= lost;
  const msg = k.messageId ? w.inbox.find((m) => m.id === k.messageId) : undefined;
  if (msg) {
    msg.resolved = "taken";
    emit(w, { type: "phish_result", messageId: msg.id, outcome: "took_phish" });
  }
  toast(w, `Isca de phishing! Você perdeu o escudo${lost > 0 ? ` e ${lost} bytes` : ""}. Revise os sinais da mensagem.`, "danger");
}

export function stepPickups(w: World, dt: number): void {
  void dt;
  const p = w.player;
  if (!p.alive) return;
  for (const k of w.pickups) {
    if (!k.active) continue;
    if (Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z) > 1.0 || p.pos.y > 1.2) continue;
    if (k.fake) {
      k.active = false;
      record(w, { type: "pickup_collected", t: w.time, kind: k.kind, amount: 0, fake: true });
      emit(w, { type: "pickup", kind: k.kind, amount: 0, fake: true, pos: { ...k.pos } });
      triggerTrap(w, k);
      continue;
    }
    if (!applyPickup(w, k)) continue;
    k.active = false;
    record(w, { type: "pickup_collected", t: w.time, kind: k.kind, amount: k.amount, fake: false });
    emit(w, { type: "pickup", kind: k.kind, amount: k.amount, fake: false, pos: { ...k.pos } });
    if (k.messageId) {
      const msg = w.inbox.find((m) => m.id === k.messageId);
      if (msg && msg.resolved === "open") {
        msg.resolved = "taken";
        emit(w, { type: "phish_result", messageId: msg.id, outcome: "took_legit" });
      }
    }
  }
  if (w.pickups.length > 64) w.pickups = w.pickups.filter((k) => k.active);
}
