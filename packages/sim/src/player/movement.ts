import { moveWithCollision, type Grid } from "../core/grid";
import { forwardFrom, rightFrom } from "../core/vec";
import type { SimEvent } from "../core/events";
import { PLAYER_TUNING as T, type Player, type PlayerInput } from "./player";

/** Atualiza a stamina e retorna se o sprint está ativo neste passo (com histerese de exaustão). */
export function updateStamina(p: Player, wantsSprint: boolean, moving: boolean, dt: number): boolean {
  if (p.exhausted && p.stamina >= T.staminaRecover) p.exhausted = false;
  const sprint = wantsSprint && moving && !p.exhausted && p.stamina > 0;
  if (sprint) {
    p.stamina = Math.max(0, p.stamina - T.staminaDrain * dt);
    if (p.stamina <= 0) p.exhausted = true;
  } else {
    p.stamina = Math.min(p.maxStamina, p.stamina + T.staminaRegen * dt);
  }
  return sprint;
}

export function stepPlayerMovement(p: Player, input: PlayerInput, grid: Grid, dt: number, events: SimEvent[]): void {
  p.prevPos = { ...p.pos };
  p.yaw = input.yaw;
  p.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, input.pitch));
  if (!p.alive) return;

  const fwd = forwardFrom(p.yaw, 0);
  const right = rightFrom(p.yaw);
  let wx = fwd.x * input.forward + right.x * input.strafe;
  let wz = fwd.z * input.forward + right.z * input.strafe;
  const wl = Math.hypot(wx, wz);
  const moving = wl > 1e-6;
  if (moving) { wx /= wl; wz /= wl; }
  p.moving = moving;

  p.sprinting = updateStamina(p, input.sprint && input.forward > 0, moving, dt);
  let speed = p.sprinting ? T.sprintSpeed : T.walkSpeed;
  if (p.saturated) speed *= T.saturatedSpeedMult;
  if (p.shieldUp) speed *= 0.75;

  const control = p.onGround ? 1 : T.airControl;
  const k = Math.min(1, T.accel * control * dt);
  p.vel.x += (wx * speed - p.vel.x) * k;
  p.vel.z += (wz * speed - p.vel.z) * k;

  if (input.jump && p.onGround) {
    p.vel.y = T.jumpVelocity;
    p.onGround = false;
    events.push({ type: "jump" });
  }
  p.vel.y += T.gravity * dt;

  const wantX = p.pos.x + p.vel.x * dt;
  const wantZ = p.pos.z + p.vel.z * dt;
  const next = moveWithCollision(grid, p.pos, p.vel.x * dt, p.vel.z * dt, p.radius);
  if (Math.abs(next.x - wantX) > 1e-5) p.vel.x = 0;
  if (Math.abs(next.z - wantZ) > 1e-5) p.vel.z = 0;
  p.pos.x = next.x;
  p.pos.z = next.z;

  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vel.y = 0;
    p.onGround = true;
  } else {
    const headroom = grid.wallHeight - 1.85;
    if (p.pos.y > headroom) { p.pos.y = headroom; p.vel.y = Math.min(0, p.vel.y); }
  }
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
}
