export interface Vec3 { x: number; y: number; z: number }

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const distXZ = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
export const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l === 0 ? v3() : scale(a, 1 / l);
}

/** Direção de visão (convenção Three.js): yaw=0 olha para -Z; yaw positivo gira para a esquerda. */
export function forwardFrom(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Vetor "direita" no plano XZ para um yaw. */
export function rightFrom(yaw: number): Vec3 {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}
