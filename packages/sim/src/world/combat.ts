import { raycastGrid } from "../core/grid";
import { findEnemyDef, isAmmoWeapon, type EnemyStatus, type ProjectileWeaponDef, type WeaponDef } from "../core/types";
import { forwardFrom, type Vec3 } from "../core/vec";
import { eyePosition } from "../player/player";
import { computeDamage, type CounterKind } from "../weapons/damage";
import { hitRadius, hitscan, raySphere, targetCenter } from "../weapons/hitscan";
import { canFire, magazineSize, startReload, tickWeapon } from "../weapons/weapon";
import type { PlayerInput } from "../player/player";
import { getBehavior } from "../enemies/behaviors";
import type { Enemy } from "./entities";
import { emit, newId, record, toast, weaponDefAt, type World } from "./world";

// ───────────────────────── Estados dos inimigos ─────────────────────────

/** Recalcula os estados (ocultos, revelados, travados…) de um inimigo. */
export function refreshStatuses(w: World, e: Enemy): Set<EnemyStatus> {
  const s = e.statuses;
  s.clear();
  const revealed = e.revealedUntil > w.time;
  if (revealed) s.add("revealed");
  if (e.disguised) s.add("disguised");
  if (e.lockedOutUntil > w.time) s.add("locked_out");
  const b = getBehavior(e.behavior);
  b.statuses?.(w, e, s);
  return s;
}

export const isShootable = (e: Enemy): boolean => e.alive && !e.disguised;

// ───────────────────────── Dano ao jogador ─────────────────────────

const SHIELD_CONE_COS = Math.cos((110 / 2) * (Math.PI / 180));

function inFrontCone(w: World, from: Vec3, cosLimit: number): boolean {
  const p = w.player;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const dx = from.x - p.pos.x, dz = from.z - p.pos.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return true;
  return (dx * fx + dz * fz) / l >= cosLimit;
}

export function damagePlayer(w: World, amount: number, from: Vec3 | null, source: string | null, kind: "melee" | "projectile" | "effect"): number {
  const p = w.player;
  if (!p.alive || w.status !== "playing" || amount <= 0) return 0;
  if (p.invuln > 0) return 0;
  if (kind === "projectile" && p.shieldUp && from && inFrontCone(w, from, SHIELD_CONE_COS)) {
    emit(w, { type: "shield_block", pos: { ...from } });
    return 0;
  }
  let remaining = amount;
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, remaining);
    p.shield -= absorbed;
    remaining -= absorbed;
  }
  p.hp = Math.max(0, p.hp - remaining);
  p.lastDamageAt = w.time;
  w.stats.damageTaken += amount;
  if (source) w.lastDamageSource = source;
  emit(w, { type: "player_damaged", amount, from: from ? { ...from } : null, source });
  if (p.hp <= 0) handleLethal(w);
  return remaining;
}

function handleLethal(w: World): void {
  const p = w.player;
  if (w.mods.mfa && w.mfaAvailable) {
    w.mfaAvailable = false;
    w.stats.mfaUsed = true;
    p.hp = Math.round(p.maxHp * 0.35);
    p.invuln = 2;
    emit(w, { type: "mfa_saved" });
    toast(w, "MFA: segunda verificação salvou sua sessão. Integridade restaurada parcialmente.", "success");
    return;
  }
  p.alive = false;
  p.shieldUp = false;
  w.status = "dead";
  w.deathCause = w.lastDamageSource;
  w.stats.deaths++;
  emit(w, { type: "player_died", cause: w.deathCause });
  record(w, { type: "player_died", t: w.time, cause: w.deathCause });
}

// ───────────────────────── Dano aos inimigos ─────────────────────────

export function damageEnemy(w: World, e: Enemy, base: number, weapon: WeaponDef, point: Vec3): { damage: number; counter: CounterKind; killed: boolean } {
  if (!e.alive) return { damage: 0, counter: "neutral", killed: false };
  const statuses = refreshStatuses(w, e);
  const { damage, counter } = computeDamage(base, weapon, e.def, statuses, w.mods.damageMult);
  e.hp -= damage;
  e.hitFlash = 0.12;
  e.lastHitWeapon = weapon.id;
  emit(w, { type: "enemy_hit", enemyId: e.id, damage, counter, point: { ...point } });
  getBehavior(e.behavior).onDamaged?.(w, e, damage, weapon.id);
  if (e.hp <= 0) {
    killEnemy(w, e, weapon.id, counter, statuses.has("revealed"));
    return { damage, counter, killed: true };
  }
  if (e.state === "patrol") {
    e.state = "alert";
    e.stateTime = 0;
  }
  return { damage, counter, killed: false };
}

export function killEnemy(w: World, e: Enemy, weaponId: string, counter: CounterKind, wasRevealed: boolean): void {
  e.alive = false;
  e.hp = 0;
  const st = w.stats;
  st.kills[e.type] = (st.kills[e.type] ?? 0) + 1;
  st.killsTotal++;
  if (counter === "strong") st.killsStrong++;
  if (counter === "weak") st.killsWeak++;
  if (wasRevealed) st.revealedKills[e.type] = (st.revealedKills[e.type] ?? 0) + 1;
  emit(w, { type: "enemy_killed", enemyId: e.id, enemyType: e.type, weaponId, counter, pos: { ...e.pos } });
  record(w, { type: "enemy_killed", t: w.time, enemyType: e.type, weapon: weaponId, counter, revealed: wasRevealed });
  const drops = e.def.drops;
  if (drops && w.rng.chance(drops.bytesChance)) {
    const amount = w.rng.int(drops.bytesMin, drops.bytesMax);
    w.pickups.push({
      id: newId(w, "k"), kind: "bytes", amount, pos: { x: e.pos.x, y: 0, z: e.pos.z },
      active: true, fake: false, revealed: false, source: "drop", messageId: null,
    });
  }
  getBehavior(e.behavior).onDeath?.(w, e, weaponId);
}

// ───────────────────────── Armas do jogador ─────────────────────────

function markWeaponUsed(w: World, weaponId: string): void {
  if (!w.stats.weaponsUsed.includes(weaponId)) {
    w.stats.weaponsUsed.push(weaponId);
    record(w, { type: "weapon_used", t: w.time, weapon: weaponId });
  }
}

export function switchWeapon(w: World, index: number): void {
  const p = w.player;
  if (index === p.active || index < 0 || index >= p.weapons.length) return;
  const cur = p.weapons[p.active];
  if (cur) { cur.reloading = false; }
  p.active = index;
  p.shieldUp = false;
  const ws = p.weapons[index]!;
  ws.cooldown = Math.max(ws.cooldown, 0.25);
  emit(w, { type: "weapon_switch", weaponId: ws.defId });
}

function aimDirection(w: World, spread: number): Vec3 {
  const p = w.player;
  const sy = spread > 0 ? (w.rng.next() - 0.5) * 2 * spread : 0;
  const sp = spread > 0 ? (w.rng.next() - 0.5) * 2 * spread : 0;
  return forwardFrom(p.yaw + sy, p.pitch + sp);
}

const rofMult = (w: World): number => (w.player.saturated ? 0.6 : 1);

export function stepPlayerWeapons(w: World, input: PlayerInput, dt: number): void {
  const p = w.player;
  if (!p.alive) return;

  // troca de arma
  if (input.weaponSlot > 0) {
    const idx = p.weapons.findIndex((ws) => slotOf(w, ws.defId) === input.weaponSlot);
    if (idx >= 0) switchWeapon(w, idx);
  } else if (input.weaponCycle !== 0 && p.weapons.length > 1) {
    const n = p.weapons.length;
    switchWeapon(w, (p.active + input.weaponCycle + n) % n);
  }

  const def = weaponDefAt(w, p.active);
  const ws = p.weapons[p.active]!;

  for (let i = 0; i < p.weapons.length; i++) {
    const d = weaponDefAt(w, i);
    tickWeapon(p.weapons[i]!, d, w.mods, dt, i === p.active && d.kind === "shield" && p.shieldUp, w.events);
  }

  if (input.reload) startReload(ws, def, w.mods, w.events);

  if (def.kind !== "shield") p.shieldUp = false;

  switch (def.kind) {
    case "hitscan":
    case "beam": {
      if (!input.fire) break;
      if (ws.magazine <= 0 && !ws.reloading) {
        if (!startReload(ws, def, w.mods, w.events) && ws.cooldown <= 0) {
          emit(w, { type: "dry_fire", weaponId: def.id });
          ws.cooldown = 0.3;
        }
        break;
      }
      if (!canFire(ws, def)) break;
      ws.magazine--;
      ws.cooldown = Math.max(-1 / 60, Math.min(0, ws.cooldown)) + 1 / (def.rof * rofMult(w));
      markWeaponUsed(w, def.id);
      fireHitscan(w, def, def.kind === "hitscan" ? def.spread : 0.0015);
      break;
    }
    case "projectile": {
      if (!input.fire) break;
      if (ws.magazine <= 0 && !ws.reloading) {
        if (!startReload(ws, def, w.mods, w.events) && ws.cooldown <= 0) {
          emit(w, { type: "dry_fire", weaponId: def.id });
          ws.cooldown = 0.3;
        }
        break;
      }
      if (!canFire(ws, def)) break;
      ws.magazine--;
      ws.cooldown = Math.max(-1 / 60, Math.min(0, ws.cooldown)) + 1 / (def.rof * rofMult(w));
      markWeaponUsed(w, def.id);
      fireProjectileWeapon(w, def);
      break;
    }
    case "scanner": {
      if (!input.fire || !canFire(ws, def)) break;
      ws.energy -= def.energyCost;
      ws.cooldown = Math.min(0, ws.cooldown) + def.cooldown;
      markWeaponUsed(w, def.id);
      scannerPulse(w, def.radius, def.revealSeconds * w.mods.scannerDurationMult);
      break;
    }
    case "shield": {
      const want = input.fire && !ws.locked && ws.energy > 0;
      p.shieldUp = want;
      if (!want) break;
      markWeaponUsed(w, def.id);
      ws.energy = Math.max(0, ws.energy - def.energyDrain * dt);
      w.vpnTunnelUntil = w.time + def.tunnelLinger;
      ws.pulseTimer -= dt;
      if (ws.pulseTimer <= 0) {
        ws.pulseTimer = def.pulseInterval;
        shieldPulse(w, def);
      }
      break;
    }
  }
  if (magazineSize(def, w.mods) > 0 && ws.magazine > magazineSize(def, w.mods)) ws.magazine = magazineSize(def, w.mods);
}

function slotOf(w: World, defId: string): number {
  const d = w.reg.weapons.find((x) => x.id === defId);
  return d ? d.slot : -1;
}

function fireHitscan(w: World, def: WeaponDef & { range: number }, spread: number): void {
  const p = w.player;
  const origin = eyePosition(p);
  const dir = aimDirection(w, spread);
  const targets = w.enemies.filter(isShootable);
  const res = hitscan(w.grid, origin, dir, def.range, targets);
  w.stats.shots++;
  emit(w, { type: "shot", weaponId: def.id, origin, end: res.point, hit: res.kind });
  if (res.target) {
    w.stats.hits++;
    damageEnemy(w, res.target, (def as { damage: number }).damage, def, res.point);
  } else if (res.wall) {
    emit(w, { type: "wall_hit", point: res.wall.point, normal: res.wall.normal });
    if (def.kind === "beam" && res.wall.cell) cleanTerminalAt(w, res.wall.cell[0], res.wall.cell[1], def.cleanRate / def.rof);
  }
}

function cleanTerminalAt(w: World, c: number, r: number, amount: number): void {
  const t = w.terminals.find((x) => x.cell[0] === c && x.cell[1] === r);
  if (!t || !t.corrupted) return;
  t.cleanProgress = Math.min(1, t.cleanProgress + amount);
  if (t.cleanProgress >= 1) {
    t.corrupted = false;
    t.cleanProgress = 0;
    emit(w, { type: "terminal_cleaned", terminalId: t.id });
    toast(w, "Terminal sanitizado: entradas maliciosas removidas.", "success");
  }
}

function fireProjectileWeapon(w: World, def: ProjectileWeaponDef): void {
  const p = w.player;
  const origin = eyePosition(p);
  const dir = aimDirection(w, 0);
  const start = { x: origin.x + dir.x * 0.6, y: origin.y - 0.15 + dir.y * 0.6, z: origin.z + dir.z * 0.6 };
  w.projectiles.push({
    id: newId(w, "p"), owner: "player", pos: start, prevPos: { ...start },
    vel: { x: dir.x * def.projectileSpeed, y: dir.y * def.projectileSpeed, z: dir.z * def.projectileSpeed },
    radius: 0.25, damage: def.damage, ttl: def.range / def.projectileSpeed,
    weaponId: def.id, sourceEnemy: null, sourceType: null, splash: def.splashRadius,
  });
  w.stats.shots++;
  emit(w, { type: "shot", weaponId: def.id, origin, end: start, hit: "none" });
}

export function scannerPulse(w: World, radius: number, seconds: number): void {
  const p = w.player.pos;
  emit(w, { type: "scan_pulse", origin: { ...p }, radius });
  for (const e of w.enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > radius) continue;
    const wasHidden = e.statuses.has("hidden") || e.disguised;
    e.revealedUntil = w.time + seconds;
    if (e.disguised) e.disguised = false;
    getBehavior(e.behavior).onRevealed?.(w, e);
    if (wasHidden) emit(w, { type: "enemy_revealed", enemyId: e.id });
  }
  for (const k of w.pickups) {
    if (k.active && k.fake && Math.hypot(k.pos.x - p.x, k.pos.z - p.z) <= radius) k.revealed = true;
  }
}

function shieldPulse(w: World, def: WeaponDef & { pulseRange: number; pulseDamage: number; coneDeg: number }): void {
  const cosLimit = Math.cos((def.coneDeg / 2) * (Math.PI / 180));
  const eye = eyePosition(w.player);
  for (const e of w.enemies) {
    if (!isShootable(e)) continue;
    const d = Math.hypot(e.pos.x - w.player.pos.x, e.pos.z - w.player.pos.z);
    if (d > def.pulseRange || !inFrontCone(w, e.pos, cosLimit)) continue;
    const c = targetCenter(e);
    const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    const hit = raycastGrid(w.grid, eye, { x: dx / l, y: dy / l, z: dz / l }, l);
    if (hit && hit.distance < l - 0.2) continue;
    damageEnemy(w, e, def.pulseDamage, def, c);
  }
}

// ───────────────────────── Projéteis ─────────────────────────

function explode(w: World, pos: Vec3, weapon: ProjectileWeaponDef, dirX: number, dirZ: number): void {
  emit(w, { type: "explosion", pos: { ...pos }, radius: weapon.splashRadius, weaponId: weapon.id });
  for (const e of w.enemies) {
    if (!isShootable(e)) continue;
    const c = targetCenter(e);
    const d = Math.hypot(c.x - pos.x, (c.y - pos.y) * 0.5, c.z - pos.z);
    if (d > weapon.splashRadius + e.radius) continue;
    const falloff = 1 - 0.5 * Math.min(1, d / weapon.splashRadius);
    const r = damageEnemy(w, e, weapon.damage * falloff, weapon, c);
    if (r.damage > 0) w.stats.hits++;
  }
  if (weapon.barrier) {
    const l = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / l, nz = dirZ / l;
    const center = { x: pos.x - nx * 0.8, y: 0, z: pos.z - nz * 0.8 };
    // limita a uma barreira ativa por vez
    w.barriers = w.barriers.filter((b) => b.until > w.time).slice(-1);
    const id = newId(w, "b");
    w.barriers.push({
      id, center, nx, nz, halfWidth: weapon.barrier.width / 2, height: weapon.barrier.height,
      createdAt: w.time, until: w.time + weapon.barrier.seconds, throttle: weapon.barrier.throttleSeconds, nextPass: w.time,
    });
    emit(w, { type: "barrier_created", barrierId: id });
  }
}

function barrierBlocksSegment(w: World, a: Vec3, b: Vec3): boolean {
  for (const br of w.barriers) {
    if (br.until <= w.time) continue;
    const da = (a.x - br.center.x) * br.nx + (a.z - br.center.z) * br.nz;
    const db = (b.x - br.center.x) * br.nx + (b.z - br.center.z) * br.nz;
    if ((da > 0) === (db > 0)) continue;
    const t = da / (da - db);
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    const lateral = (x - br.center.x) * -br.nz + (z - br.center.z) * br.nx;
    if (Math.abs(lateral) <= br.halfWidth && y >= 0 && y <= br.height) return true;
  }
  return false;
}

export function stepProjectiles(w: World, dt: number): void {
  const keep = [];
  for (const pr of w.projectiles) {
    pr.prevPos = { ...pr.pos };
    pr.ttl -= dt;
    const move = { x: pr.vel.x * dt, y: pr.vel.y * dt, z: pr.vel.z * dt };
    const len = Math.hypot(move.x, move.y, move.z);
    const dir = len > 0 ? { x: move.x / len, y: move.y / len, z: move.z / len } : { x: 0, y: 0, z: -1 };
    const next = { x: pr.pos.x + move.x, y: pr.pos.y + move.y, z: pr.pos.z + move.z };
    let impact: Vec3 | null = null;
    let consumed = false;

    const wall = len > 0 ? raycastGrid(w.grid, pr.pos, dir, len) : null;
    const wallT = wall ? wall.distance : Infinity;

    if (pr.owner === "player") {
      let bestT = wallT;
      for (const e of w.enemies) {
        if (!isShootable(e)) continue;
        const t = raySphere(pr.pos, dir, targetCenter(e), hitRadius(e) + pr.radius);
        if (t !== null && t <= len && t < bestT) bestT = t;
      }
      if (bestT <= len) {
        impact = { x: pr.pos.x + dir.x * bestT, y: pr.pos.y + dir.y * bestT, z: pr.pos.z + dir.z * bestT };
      }
      if (impact && pr.weaponId) {
        const wdef = w.reg.weapons.find((x) => x.id === pr.weaponId);
        if (wdef && wdef.kind === "projectile") explode(w, impact, wdef, pr.vel.x, pr.vel.z);
        consumed = true;
      }
    } else {
      const segEnd = wall ? wall.point : next;
      if (barrierBlocksSegment(w, pr.pos, segEnd)) {
        emit(w, { type: "barrier_blocked", pos: { ...pr.pos }, allowed: false });
        consumed = true;
      } else if (w.player.alive) {
        const pp = w.player.pos;
        for (const s of [0.5, 1]) {
          const q = { x: pr.pos.x + move.x * s, y: pr.pos.y + move.y * s, z: pr.pos.z + move.z * s };
          if (s * len > wallT) break;
          const horiz = Math.hypot(q.x - pp.x, q.z - pp.z);
          if (horiz <= w.player.radius + pr.radius && q.y >= pp.y - pr.radius && q.y <= pp.y + 1.85 + pr.radius) {
            const from = pr.sourceEnemy ? w.enemies.find((e) => e.id === pr.sourceEnemy)?.pos ?? pr.pos : pr.pos;
            damagePlayer(w, pr.damage, { ...from }, pr.sourceType, "projectile");
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && wall) {
        emit(w, { type: "wall_hit", point: wall.point, normal: wall.normal });
        consumed = true;
      }
    }
    if (!consumed && wall && pr.owner === "player") {
      const wdef = w.reg.weapons.find((x) => x.id === pr.weaponId);
      if (wdef && wdef.kind === "projectile") explode(w, wall.point, wdef, pr.vel.x, pr.vel.z);
      consumed = true;
    }
    if (consumed || pr.ttl <= 0) {
      if (!consumed && pr.owner === "player" && pr.ttl <= 0) {
        const wdef = w.reg.weapons.find((x) => x.id === pr.weaponId);
        if (wdef && wdef.kind === "projectile") explode(w, next, wdef, pr.vel.x, pr.vel.z);
      }
      continue;
    }
    pr.pos = next;
    keep.push(pr);
  }
  w.projectiles = keep;
}

export function ammoSummary(w: World): { magazine: number; reserve: number | null; energy: number | null; reloading: boolean } {
  const def = weaponDefAt(w, w.player.active);
  const ws = w.player.weapons[w.player.active]!;
  if (isAmmoWeapon(def)) return { magazine: ws.magazine, reserve: ws.reserve, energy: null, reloading: ws.reloading };
  return { magazine: 0, reserve: null, energy: ws.energy / def.energyMax, reloading: false };
}

export { findEnemyDef };
