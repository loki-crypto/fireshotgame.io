import * as THREE from "three";

export const PALETTE = {
  background: 0x04060c,
  floor: "#070b13",
  floorLine: "#10283e",
  wall: 0x0b1424,
  wallPanel: "#0c1729",
  wallLine: "#132a44",
  ceiling: "#05080f",
  accent: "#39d0ff",
  ok: "#3dff8a",
  warn: "#ffb13d",
  danger: "#ff3d5a",
  corrupt: "#ff3df0",
  locked: "#ff9f1c",
  health: "#3dff8a",
  shield: "#3da5ff",
  ammo: "#ffd23d",
  bytes: "#39d0ff",
  backup: "#f2f6ff",
  energy: "#b8ff3d",
} as const;

const basicCache = new Map<string, THREE.MeshBasicMaterial>();

/** Material "neon" (sem iluminação), compartilhado por cor. */
export function neon(color: string | number, opts: { transparent?: boolean; opacity?: number; additive?: boolean; wireframe?: boolean } = {}): THREE.MeshBasicMaterial {
  const key = `${color}|${opts.transparent ?? false}|${opts.opacity ?? 1}|${opts.additive ?? false}|${opts.wireframe ?? false}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opts.transparent ?? (opts.opacity !== undefined && opts.opacity < 1),
      opacity: opts.opacity ?? 1,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !(opts.additive || (opts.opacity !== undefined && opts.opacity < 1)),
      wireframe: opts.wireframe ?? false,
    });
    basicCache.set(key, m);
  }
  return m;
}

export function lambert(color: number | string, emissive: number | string = 0x000000, emissiveIntensity = 1): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity });
}

export function colorLerp(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
