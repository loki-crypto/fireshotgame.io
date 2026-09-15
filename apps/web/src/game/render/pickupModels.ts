import * as THREE from "three";
import type { PickupKind } from "@fireshot/sim";
import { PALETTE } from "./palette";

export interface PickupModel {
  root: THREE.Group;
  body: THREE.Group;
  mats: THREE.MeshBasicMaterial[];
  warn: THREE.Sprite | null;
  dispose(): void;
}

const shared = {
  box: new THREE.BoxGeometry(1, 1, 1),
  hex: new THREE.CylinderGeometry(0.4, 0.4, 0.12, 6),
  octa: new THREE.OctahedronGeometry(0.18, 0),
  disk: new THREE.CylinderGeometry(0.35, 0.35, 0.08, 20),
  ring: new THREE.RingGeometry(0.45, 0.55, 24),
};

export const PICKUP_COLOR: Record<PickupKind, string> = {
  health: PALETTE.health, shield: PALETTE.shield, ammo: PALETTE.ammo, bytes: PALETTE.bytes, backup: PALETTE.backup, energy: PALETTE.energy,
};

/**
 * Modelo de pickup. `tell` (0..1) aplica sinais sutis de falsificação: matiz levemente deslocada,
 * rotação irregular (animada pelo Renderer) — o jogador atento consegue perceber.
 */
export function createPickupModel(kind: PickupKind, tell = 0, warnTexture: THREE.Texture | null = null): PickupModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const base = new THREE.Color(PICKUP_COLOR[kind]);
  if (tell > 0) base.offsetHSL(-0.035 * tell, -0.15 * tell, -0.05 * tell);
  const mats: THREE.MeshBasicMaterial[] = [];
  const m = (c: THREE.ColorRepresentation, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial => {
    const x = new THREE.MeshBasicMaterial({ color: c, ...opts });
    mats.push(x);
    return x;
  };
  switch (kind) {
    case "health": {
      const a = new THREE.Mesh(shared.box, m(base));
      a.scale.set(0.55, 0.18, 0.18);
      const b = new THREE.Mesh(shared.box, m(base));
      b.scale.set(0.18, 0.55, 0.18);
      body.add(a, b);
      break;
    }
    case "shield": {
      const h = new THREE.Mesh(shared.hex, m(base));
      h.rotation.x = Math.PI / 2;
      body.add(h);
      break;
    }
    case "ammo": {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(shared.box, m(base));
        c.scale.set(0.12, 0.38, 0.12);
        c.position.x = (i - 1) * 0.17;
        body.add(c);
      }
      break;
    }
    case "bytes": {
      for (let i = 0; i < 3; i++) {
        const o = new THREE.Mesh(shared.octa, m(base));
        o.position.set(Math.cos(i * 2.1) * 0.2, Math.sin(i * 2.1) * 0.1, Math.sin(i * 2.1) * 0.2);
        body.add(o);
      }
      break;
    }
    case "backup": {
      const d = new THREE.Mesh(shared.disk, m(base));
      d.rotation.x = Math.PI / 2;
      const hole = new THREE.Mesh(shared.disk, m(0x223344));
      hole.scale.set(0.3, 1.2, 0.3);
      hole.rotation.x = Math.PI / 2;
      body.add(d, hole);
      break;
    }
    case "energy": {
      const c = new THREE.Mesh(shared.box, m(base));
      c.scale.set(0.2, 0.45, 0.2);
      c.rotation.z = 0.5;
      body.add(c);
      break;
    }
  }
  const ring = new THREE.Mesh(shared.ring, m(base, { transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  root.add(ring);
  let warn: THREE.Sprite | null = null;
  if (warnTexture) {
    const sm = new THREE.SpriteMaterial({ map: warnTexture, transparent: true, depthTest: false });
    warn = new THREE.Sprite(sm);
    warn.scale.set(0.9, 0.45, 1);
    warn.position.y = 1.4;
    warn.visible = false;
    root.add(warn);
  }
  return { root, body, mats, warn, dispose: () => { mats.forEach((x) => x.dispose()); warn?.material.dispose(); } };
}
