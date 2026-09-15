import { raycastGrid, type Grid, type GridRayHit } from "../core/grid";
import { dot, sub, type Vec3 } from "../core/vec";

export interface Targetable {
  id: string;
  pos: Vec3;
  radius: number;
  height: number;
  hover: number;
}

export interface HitscanResult<T extends Targetable> {
  kind: "enemy" | "wall" | "none";
  distance: number;
  point: Vec3;
  wall: GridRayHit | null;
  target: T | null;
}

/** Interseção raio-esfera; retorna o menor t >= 0 ou null. `dir` normalizado. */
export function raySphere(origin: Vec3, dir: Vec3, center: Vec3, radius: number): number | null {
  const oc = sub(origin, center);
  const b = dot(oc, dir);
  const c = dot(oc, oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  if (t0 >= 0) return t0;
  const t1 = -b + s;
  return t1 >= 0 ? t1 : null;
}

/** Centro de colisão de um alvo (esfera no meio do corpo). */
export const targetCenter = (t: Targetable): Vec3 => ({ x: t.pos.x, y: t.pos.y + t.hover + t.height / 2, z: t.pos.z });

/** Raio de colisão efetivo para tiros (corpo alongado aproximado por esfera um pouco maior). */
export const hitRadius = (t: Targetable): number => Math.max(t.radius, t.height * 0.5) * 0.95;

export function hitscan<T extends Targetable>(grid: Grid, origin: Vec3, dir: Vec3, range: number, targets: Iterable<T>): HitscanResult<T> {
  const wall = raycastGrid(grid, origin, dir, range);
  let bestT = wall ? wall.distance : range;
  let best: T | null = null;
  for (const e of targets) {
    const t = raySphere(origin, dir, targetCenter(e), hitRadius(e));
    if (t !== null && t < bestT) { bestT = t; best = e; }
  }
  const point = { x: origin.x + dir.x * bestT, y: origin.y + dir.y * bestT, z: origin.z + dir.z * bestT };
  if (best) return { kind: "enemy", distance: bestT, point, wall, target: best };
  if (wall) return { kind: "wall", distance: wall.distance, point: wall.point, wall, target: null };
  return { kind: "none", distance: range, point, wall: null, target: null };
}
