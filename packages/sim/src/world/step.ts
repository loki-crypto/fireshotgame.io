import { stepPlayerMovement } from "../player/movement";
import type { PlayerInput } from "../player/player";
import { basicAI } from "../enemies/ai";
import { getBehavior } from "../enemies/behaviors";
import { updatePlayerField } from "../enemies/navigation";
import { specialNum } from "../enemies/enemy";
import { stepArenas, stepSpawners, startArena } from "../phase/arena";
import { reportLatest, stepMessages } from "../phase/messages";
import { stepPickups } from "../phase/pickups";
import { findFocusTerminal } from "../phase/terminals";
import { manualBackup } from "./checkpoint";
import { refreshStatuses, stepPlayerWeapons, stepProjectiles } from "./combat";
import { applyEffects } from "./effects";
import { decryptPlayer } from "./encryption";
import { emit, toast, type World } from "./world";

export const FIXED_DT = 1 / 60;

function stepEnemies(w: World, dt: number): void {
  const list = w.enemies.slice();
  for (const e of list) {
    if (!e.alive) continue;
    e.prevPos = { ...e.pos };
    e.stateTime += dt;
    if (e.attackTimer > 0) e.attackTimer = Math.max(0, e.attackTimer - dt);
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    refreshStatuses(w, e);
    const b = getBehavior(e.behavior);
    const handled = b.update ? b.update(w, e, dt) : false;
    if (!handled && e.alive) basicAI(w, e, dt, b.speedMult ? b.speedMult(w, e) : 1);
  }
  // separação simples entre inimigos (evita empilhamento)
  const alive = w.enemies.filter((e) => e.alive && !e.disguised);
  for (let i = 0; i < alive.length; i++) {
    const a = alive[i]!;
    for (let j = i + 1; j < alive.length; j++) {
      const b = alive[j]!;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const min = (a.radius + b.radius) * 0.9;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5;
      const nx = dx / d, nz = dz / d;
      if (w.grid.isWalkable(...w.grid.worldToCell(a.pos.x - nx * push, a.pos.z - nz * push))) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
      if (w.grid.isWalkable(...w.grid.worldToCell(b.pos.x + nx * push, b.pos.z + nz * push))) { b.pos.x += nx * push; b.pos.z += nz * push; }
    }
  }
  // remove inimigos mortos há algum tempo
  if (w.tick % 30 === 0) {
    for (const e of w.enemies) if (!e.alive && e.data.deadAt === undefined) e.data.deadAt = w.time;
    w.enemies = w.enemies.filter((e) => e.alive || w.time - (e.data.deadAt as number) < 1.5);
  }
}

function stepZones(w: World): void {
  const [c, r] = w.grid.worldToCell(w.player.pos.x, w.player.pos.z);
  const key = w.grid.cellIndex(c, r);
  for (const z of w.zones) {
    if (!z.cells.has(key)) continue;
    if (z.type === "arena") {
      const a = w.arenas.find((x) => x.id === z.id);
      if (a && a.state === "idle") startArena(w, a);
    } else if (z.type === "trigger") {
      const t = w.phase.triggers?.find((x) => x.id === z.id);
      if (!t) continue;
      if (z.fired && t.once !== false) continue;
      z.fired = true;
      applyEffects(w, t.effects);
    } else if (z.type === "exit" && w.exitOpen && w.status === "playing") {
      w.status = "complete";
      emit(w, { type: "phase_complete" });
    }
  }
}

export function exitRequirementsMet(w: World): boolean {
  const req = w.phase.exit.requires;
  if (req.terminals?.some((id) => !w.terminals.find((t) => t.id === id)?.solved)) return false;
  if (req.arenas?.some((id) => w.arenas.find((a) => a.id === id)?.state !== "cleared")) return false;
  if (req.bossDefeated && !w.bossDefeated) return false;
  if (req.flags?.some((f) => !w.flags.has(f))) return false;
  return true;
}

function stepStatus(w: World, dt: number): void {
  const p = w.player;
  // criptografia expira
  if (w.encryptedUntil > 0 && w.time >= w.encryptedUntil) {
    decryptPlayer(w);
    toast(w, "A criptografia temporária expirou. Em um incidente real, sem backup, os dados estariam perdidos.", "info");
  }
  // regeneração de escudo (upgrade)
  if (w.mods.shieldRegen > 0 && p.alive && w.time - p.lastDamageAt > 4 && p.shield < p.maxShield) {
    p.shield = Math.min(p.maxShield, p.shield + w.mods.shieldRegen * dt);
  }
  // saturação por Botnet (DDoS)
  let swarmNear = 0;
  let threshold = Infinity;
  for (const e of w.enemies) {
    if (!e.alive || e.behavior !== "swarm") continue;
    threshold = Math.min(threshold, specialNum(e.def, "saturateCount", 5));
    if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 4.5) swarmNear++;
  }
  const saturated = swarmNear >= threshold;
  if (saturated !== p.saturated) {
    p.saturated = saturated;
    emit(w, { type: "saturated", on: saturated });
    if (saturated && !w.flags.has("hint:ddos")) {
      w.flags.add("hint:ddos");
      toast(w, "Banda saturada! Volume de tráfego reduz sua velocidade e cadência. Use o Firewall Cannon (4).", "warn");
    }
  }
  w.barriers = w.barriers.filter((b) => b.until > w.time);
  for (const d of w.doors) {
    const target = d.open ? 1 : 0;
    d.amount += Math.sign(target - d.amount) * Math.min(Math.abs(target - d.amount), dt * 2.5);
  }
  const open = exitRequirementsMet(w);
  if (open && !w.exitOpen) {
    w.exitOpen = true;
    emit(w, { type: "exit_open" });
    toast(w, "Saída liberada! Siga até o portal de saída.", "success");
  }
}

/** Avança a simulação em um passo fixo. Eventos acumulam em `w.events` até o consumidor drená-los. */
export function stepWorld(w: World, input: PlayerInput, dt: number = FIXED_DT): void {
  if (w.status !== "playing") return;
  w.tick++;
  w.time += dt;
  if (input.backup) manualBackup(w);
  if (input.report) reportLatest(w);
  stepPlayerMovement(w.player, input, w.grid, dt, w.events);
  updatePlayerField(w);
  stepPlayerWeapons(w, input, dt);
  stepEnemies(w, dt);
  stepProjectiles(w, dt);
  stepSpawners(w, dt);
  stepArenas(w, dt);
  stepPickups(w, dt);
  stepZones(w);
  stepMessages(w, dt);
  stepStatus(w, dt);
  w.focusTerminal = findFocusTerminal(w);
}
