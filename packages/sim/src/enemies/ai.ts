import { lineOfSight } from "../core/grid";
import { normalize } from "../core/vec";
import type { MeleeAttack, RangedAttack } from "../core/types";
import type { Enemy, EnemyState } from "../world/entities";
import { emit, newId, type World } from "../world/world";
import { damagePlayer } from "../world/combat";
import { chasePlayer, faceToward, goToCell, moveToward } from "./navigation";

export function setState(w: World, e: Enemy, s: EnemyState): void {
  if (e.state === s) return;
  e.state = s;
  e.stateTime = 0;
  emit(w, { type: "enemy_state", enemyId: e.id, state: s });
}

export const distToPlayer = (w: World, e: Enemy): number => Math.hypot(w.player.pos.x - e.pos.x, w.player.pos.z - e.pos.z);

export function seesPlayer(w: World, e: Enemy, maxDist: number): boolean {
  if (!w.player.alive) return false;
  const d = distToPlayer(w, e);
  if (d > maxDist) return false;
  const from = { x: e.pos.x, y: e.hover + e.height * 0.6, z: e.pos.z };
  const to = { x: w.player.pos.x, y: w.player.pos.y + 1.3, z: w.player.pos.z };
  return lineOfSight(w.grid, from, to);
}

/** Dispara um projétil inimigo em direção ao peito do jogador. */
export function fireProjectile(w: World, e: Enemy, atk: RangedAttack, spreadRad = 0): void {
  const from = { x: e.pos.x, y: e.hover + e.height * 0.6, z: e.pos.z };
  const lead = 0.15;
  const target = {
    x: w.player.pos.x + w.player.vel.x * lead,
    y: w.player.pos.y + 1.2,
    z: w.player.pos.z + w.player.vel.z * lead,
  };
  let dir = normalize({ x: target.x - from.x, y: target.y - from.y, z: target.z - from.z });
  if (spreadRad !== 0) {
    const cos = Math.cos(spreadRad), sin = Math.sin(spreadRad);
    dir = { x: dir.x * cos - dir.z * sin, y: dir.y, z: dir.x * sin + dir.z * cos };
  }
  w.projectiles.push({
    id: newId(w, "p"), owner: "enemy",
    pos: { ...from }, prevPos: { ...from },
    vel: { x: dir.x * atk.projectileSpeed, y: dir.y * atk.projectileSpeed, z: dir.z * atk.projectileSpeed },
    radius: atk.projectileRadius, damage: atk.damage, ttl: (atk.range * 1.5) / atk.projectileSpeed,
    weaponId: null, sourceEnemy: e.id, sourceType: e.type, splash: 0,
  });
  emit(w, { type: "enemy_projectile", pos: { ...from } });
}

function meleeStep(w: World, e: Enemy, atk: MeleeAttack, dt: number, speed: number): void {
  const d = distToPlayer(w, e);
  if (e.state === "chase") {
    if (d <= atk.range) { setState(w, e, "attack"); return; }
    chasePlayer(w, e, speed, dt);
  } else if (e.state === "attack") {
    if (d > atk.range * 1.3) { setState(w, e, "chase"); return; }
    faceToward(e, w.player.pos);
    if (e.attackTimer <= 0) {
      e.attackTimer = atk.cooldown;
      damagePlayer(w, atk.damage, { ...e.pos }, e.type, "melee");
    }
  }
}

function rangedStep(w: World, e: Enemy, atk: RangedAttack, dt: number, speed: number): void {
  const d = distToPlayer(w, e);
  const keep = atk.keepDistance ?? atk.range * 0.6;
  const sees = seesPlayer(w, e, atk.range);
  if (!sees || d > atk.range * 0.95) {
    chasePlayer(w, e, speed, dt);
  } else if (d < keep - 1.5) {
    // recua mantendo distância
    const away = { x: e.pos.x - (w.player.pos.x - e.pos.x), y: 0, z: e.pos.z - (w.player.pos.z - e.pos.z) };
    const yaw = e.yaw;
    moveToward(w, e, away, speed * 0.7, dt);
    e.yaw = yaw;
    faceToward(e, w.player.pos);
  } else {
    // movimento lateral leve para não ficar parado
    const side = Math.sin(w.time * 0.9 + e.pos.x) > 0 ? 1 : -1;
    const px = -(w.player.pos.z - e.pos.z), pz = w.player.pos.x - e.pos.x;
    const l = Math.hypot(px, pz) || 1;
    moveToward(w, e, { x: e.pos.x + (px / l) * side, y: 0, z: e.pos.z + (pz / l) * side }, speed * 0.35, dt);
    faceToward(e, w.player.pos);
  }
  if (sees && e.attackTimer <= 0 && d <= atk.range) {
    e.attackTimer = atk.cooldown;
    fireProjectile(w, e, atk);
  }
  e.state = sees ? "attack" : "chase";
}

/** Máquina de estados padrão: patrulha → alerta → perseguição → ataque. */
export function basicAI(w: World, e: Enemy, dt: number, speedMult = 1): void {
  const f = e.def.fsm;
  const speed = e.def.speed * speedMult;
  const d = distToPlayer(w, e);
  switch (e.state) {
    case "patrol": {
      if (seesPlayer(w, e, f.alertRadius)) { setState(w, e, "alert"); return; }
      if (e.route.length > 0) {
        const goal = e.route[e.routeIndex % e.route.length]!;
        if (goToCell(w, e, goal, speed * 0.6, dt)) e.routeIndex = (e.routeIndex + 1) % e.route.length;
      } else if (Math.hypot(e.home.x - e.pos.x, e.home.z - e.pos.z) > 0.5) {
        goToCell(w, e, w.grid.worldToCell(e.home.x, e.home.z), speed * 0.6, dt);
      }
      return;
    }
    case "alert": {
      faceToward(e, w.player.pos);
      if (e.stateTime >= f.alertSeconds) setState(w, e, "chase");
      return;
    }
    case "chase":
    case "attack": {
      if (!w.player.alive || d > f.loseRadius) { setState(w, e, "patrol"); return; }
      if (e.def.attack.type === "melee") meleeStep(w, e, e.def.attack, dt, speed);
      else rangedStep(w, e, e.def.attack, dt, speed);
      return;
    }
    default:
      return;
  }
}
