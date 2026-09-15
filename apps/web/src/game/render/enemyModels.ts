import * as THREE from "three";
import type { Enemy } from "@fireshot/sim";

export interface EnemyModel {
  root: THREE.Group;
  /** materiais que piscam ao levar dano */
  flash: { mat: THREE.MeshBasicMaterial | THREE.LineBasicMaterial; base: THREE.Color }[];
  /** contorno exibido quando revelado */
  outline: THREE.LineSegments | null;
  animate(t: number, e: Enemy): void;
  dispose(): void;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g as T;
}

function mat(color: THREE.ColorRepresentation, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

function builder(color: string) {
  const root = new THREE.Group();
  const flash: EnemyModel["flash"] = [];
  const owned: THREE.Material[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.MeshBasicMaterial, parent: THREE.Object3D = root, flashes = true): THREE.Mesh => {
    const mesh = new THREE.Mesh(g, m);
    parent.add(mesh);
    owned.push(m);
    if (flashes) flash.push({ mat: m, base: m.color.clone() });
    return mesh;
  };
  const edges = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation, parent: THREE.Object3D = root): THREE.LineSegments => {
    const lm = new THREE.LineBasicMaterial({ color: c });
    owned.push(lm);
    const l = new THREE.LineSegments(geo(`edges:${g.uuid}`, () => new THREE.EdgesGeometry(g)), lm);
    parent.add(l);
    return l;
  };
  const dark = new THREE.Color(color).multiplyScalar(0.25);
  return { root, flash, owned, add, edges, dark, color };
}

function finish(b: ReturnType<typeof builder>, animate: EnemyModel["animate"], outlineGeo: THREE.BufferGeometry | null): EnemyModel {
  let outline: THREE.LineSegments | null = null;
  if (outlineGeo) {
    const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    b.owned.push(m);
    outline = new THREE.LineSegments(geo(`edges:${outlineGeo.uuid}`, () => new THREE.EdgesGeometry(outlineGeo)), m);
    outline.scale.setScalar(1.15);
    outline.visible = false;
    b.root.add(outline);
  }
  return { root: b.root, flash: b.flash, outline, animate, dispose: () => b.owned.forEach((m) => m.dispose()) };
}

export function createEnemyModel(e: Enemy): EnemyModel {
  const color = e.def.color;
  switch (e.def.shape) {
    case "worm": return worm(color, e);
    case "rootkit": return rootkit(color, e);
    case "trojan": return trojan(color, e);
    case "drone": return drone(color, e);
    case "mitm": return mitm(color, e);
    case "bruteforcer": return bruteforcer(color, e);
    case "phisher": return phisher(color, e);
    case "injector": return injector(color, e);
    case "ransomware": return ransomware(color, e);
    default: return generic(color, e);
  }
}

/** Worm: corrente de segmentos que ondula (forma de "lagarta"). */
function worm(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const segs: THREE.Mesh[] = [];
  const s = geo("ico0", () => new THREE.IcosahedronGeometry(1, 0));
  for (let i = 0; i < 4; i++) {
    const m = b.add(s, mat(i === 0 ? color : b.dark.clone().lerp(new THREE.Color(color), 0.7 - i * 0.12)));
    const r = e.radius * (1 - i * 0.16);
    m.scale.setScalar(r);
    m.position.set(0, r, i * r * 1.5);
    segs.push(m);
  }
  const eye = geo("eye", () => new THREE.SphereGeometry(0.07, 6, 4));
  const e1 = b.add(eye, mat(0xffffff), segs[0], false); e1.position.set(0.45, 0.35, -0.8);
  const e2 = b.add(eye, mat(0xffffff), segs[0], false); e2.position.set(-0.45, 0.35, -0.8);
  return finish(b, (t) => {
    segs.forEach((m, i) => {
      m.position.x = Math.sin(t * 8 - i * 0.9) * 0.12 * i;
      m.position.y = e.radius * (1 - i * 0.16) + Math.abs(Math.sin(t * 8 - i)) * 0.06;
    });
  }, s);
}

/** Rootkit: octaedro escuro com núcleo girando. */
function rootkit(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const o = geo("octa", () => new THREE.OctahedronGeometry(1, 0));
  const body = b.add(o, mat(b.dark));
  body.scale.set(e.radius * 1.3, e.height * 0.5, e.radius * 1.3);
  body.position.y = e.height * 0.5;
  const core = b.add(o, mat(color));
  core.scale.setScalar(e.radius * 0.55);
  core.position.y = e.height * 0.5;
  const ed = b.edges(o, color, body);
  void ed;
  return finish(b, (t) => {
    core.rotation.y = t * 3;
    core.rotation.x = t * 2;
    body.rotation.y = -t * 0.8;
  }, o);
}

/** Trojan revelado: "caixa de presente" com espinhos. O disfarce é desenhado como pickup pelo Renderer. */
function trojan(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const box = geo("box1", () => new THREE.BoxGeometry(1, 1, 1));
  const body = b.add(box, mat(b.dark));
  body.scale.setScalar(e.radius * 1.5);
  body.position.y = e.height * 0.5;
  b.edges(box, color, body);
  const ribbon = b.add(box, mat(color));
  ribbon.scale.set(e.radius * 1.55, e.radius * 0.25, e.radius * 1.55);
  ribbon.position.y = e.height * 0.5;
  const spike = geo("tetra", () => new THREE.TetrahedronGeometry(0.28, 0));
  const spikes: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = b.add(spike, mat(color));
    const a = (i / 4) * Math.PI * 2;
    m.position.set(Math.cos(a) * e.radius * 0.95, e.height * 0.5, Math.sin(a) * e.radius * 0.95);
    spikes.push(m);
  }
  return finish(b, (t) => {
    body.rotation.y = t * 1.5;
    ribbon.rotation.y = t * 1.5;
    spikes.forEach((m, i) => { m.rotation.x = t * 4 + i; m.rotation.y = t * 3; });
  }, box);
}

/** Drone de botnet: tetraedro com anel de rotor. */
function drone(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const tet = geo("tetra1", () => new THREE.TetrahedronGeometry(1, 0));
  const body = b.add(tet, mat(color));
  body.scale.setScalar(e.radius);
  const ring = b.add(geo("ringDrone", () => new THREE.TorusGeometry(1, 0.08, 4, 12)), mat(0xffffff, { transparent: true, opacity: 0.7 }), b.root, false);
  ring.scale.setScalar(e.radius * 1.4);
  ring.rotation.x = Math.PI / 2;
  const phase = Math.random() * 10;
  return finish(b, (t) => {
    const y = e.hover + e.height / 2 + Math.sin(t * 6 + phase) * 0.12;
    body.position.y = y;
    ring.position.y = y + 0.05;
    body.rotation.y = t * 5;
    body.rotation.x = t * 2;
  }, tet);
}

/** MITM: anel vertical com duas extremidades (as duas pontas da conexão) e um olho central. */
function mitm(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const ringG = geo("torusMitm", () => new THREE.TorusGeometry(1, 0.12, 8, 24));
  const ring = b.add(ringG, mat(color));
  ring.scale.setScalar(e.radius);
  const endG = geo("sph", () => new THREE.SphereGeometry(1, 10, 8));
  const a = b.add(endG, mat(0xffffff), b.root, false);
  a.scale.setScalar(0.14);
  const c = b.add(endG, mat(0xffffff), b.root, false);
  c.scale.setScalar(0.14);
  const eye = b.add(endG, mat(b.dark.clone().lerp(new THREE.Color(color), 0.4)));
  eye.scale.setScalar(e.radius * 0.45);
  const pupil = b.add(endG, mat(color), eye, false);
  pupil.scale.setScalar(0.45);
  pupil.position.z = -0.75;
  return finish(b, (t) => {
    const y = e.hover + e.height / 2 + Math.sin(t * 2.5) * 0.15;
    ring.position.y = y;
    eye.position.y = y;
    ring.rotation.y = t * 1.2;
    a.position.set(Math.cos(t * 1.2) * e.radius * 1.25, y, -Math.sin(t * 1.2) * e.radius * 1.25);
    c.position.set(-Math.cos(t * 1.2) * e.radius * 1.25, y, Math.sin(t * 1.2) * e.radius * 1.25);
  }, ringG);
}

/** Brute Forcer: bloco pesado com dois braços-martelo. */
function bruteforcer(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const box = geo("box1", () => new THREE.BoxGeometry(1, 1, 1));
  const body = b.add(box, mat(b.dark));
  body.scale.set(e.radius * 1.6, e.height * 0.6, e.radius * 1.2);
  body.position.y = e.height * 0.45;
  b.edges(box, color, body);
  const head = b.add(box, mat(color));
  head.scale.set(e.radius * 0.8, e.height * 0.2, e.radius * 0.8);
  head.position.y = e.height * 0.88;
  const armL = new THREE.Group(), armR = new THREE.Group();
  b.root.add(armL, armR);
  armL.position.set(e.radius * 1.05, e.height * 0.65, 0);
  armR.position.set(-e.radius * 1.05, e.height * 0.65, 0);
  const cyl = geo("cylArm", () => new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6));
  for (const arm of [armL, armR]) {
    const bar = b.add(cyl, mat(b.dark.clone().multiplyScalar(2)), arm);
    bar.position.y = -0.45;
    const hammer = b.add(box, mat(color), arm);
    hammer.scale.set(0.4, 0.3, 0.55);
    hammer.position.y = -0.95;
  }
  return finish(b, (t) => {
    const k = e.state === "special" && e.lockedOutUntil <= 0 ? 9 : e.state === "special" ? 0 : 3;
    armL.rotation.x = Math.sin(t * k) * 0.9;
    armR.rotation.x = Math.sin(t * k + Math.PI) * 0.9;
  }, box);
}

/** Phisher: anzol (cone + toro) com isca pendurada. */
function phisher(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const cone = geo("cone", () => new THREE.ConeGeometry(1, 2, 6));
  const body = b.add(cone, mat(color));
  body.scale.set(e.radius * 0.8, e.radius * 0.8, e.radius * 0.8);
  body.rotation.x = Math.PI;
  const hook = b.add(geo("hookTorus", () => new THREE.TorusGeometry(1, 0.18, 6, 16, Math.PI * 1.4)), mat(0xdfe8ff));
  hook.scale.setScalar(e.radius * 0.6);
  const bait = b.add(geo("box1", () => new THREE.BoxGeometry(1, 1, 1)), mat("#ffd23d"), b.root, false);
  bait.scale.setScalar(0.2);
  return finish(b, (t) => {
    const y = e.hover + e.height / 2 + Math.sin(t * 1.8) * 0.2;
    body.position.y = y + 0.4;
    hook.position.y = y - 0.35;
    hook.rotation.z = Math.sin(t * 2) * 0.3;
    bait.position.set(Math.sin(t * 2) * 0.2, y - 0.95, 0);
    bait.rotation.y = t * 3;
  }, cone);
}

/** Injector: seringa (cilindro + agulha + anel). */
function injector(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const cyl = geo("cylInj", () => new THREE.CylinderGeometry(1, 1, 1, 8));
  const tank = b.add(cyl, mat(b.dark));
  tank.scale.set(e.radius * 0.7, e.height * 0.55, e.radius * 0.7);
  tank.position.y = e.height * 0.55;
  b.edges(cyl, color, tank);
  const fluid = b.add(cyl, mat(color, { transparent: true, opacity: 0.85 }));
  fluid.scale.set(e.radius * 0.55, e.height * 0.35, e.radius * 0.55);
  fluid.position.y = e.height * 0.5;
  const needle = b.add(geo("needle", () => new THREE.ConeGeometry(0.08, 0.7, 6)), mat(0xe8f0ff), b.root, false);
  needle.rotation.x = -Math.PI / 2;
  needle.position.set(0, e.height * 0.55, -e.radius * 1.1);
  const ring = b.add(geo("ringInj", () => new THREE.TorusGeometry(1, 0.1, 6, 16)), mat(color));
  ring.scale.setScalar(e.radius * 0.8);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = e.height * 0.9;
  return finish(b, (t) => {
    const k = e.state === "special" ? 1 + Math.sin(t * 16) * 0.2 : 1;
    fluid.scale.y = e.height * 0.35 * k;
    ring.rotation.z = t * 2;
  }, cyl);
}

/** Ransomware: icosaedro grande com anel de cadeado e casca de blindagem. */
function ransomware(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const ico = geo("ico1", () => new THREE.IcosahedronGeometry(1, 1));
  const core = b.add(ico, mat(b.dark));
  core.scale.setScalar(e.radius);
  b.edges(ico, color, core);
  const lockRing = b.add(geo("lockTorus", () => new THREE.TorusGeometry(1, 0.1, 8, 32)), mat(color));
  lockRing.scale.setScalar(e.radius * 1.35);
  const shackle = b.add(geo("shackle", () => new THREE.TorusGeometry(1, 0.14, 8, 16, Math.PI)), mat(0xffffff), b.root, false);
  shackle.scale.setScalar(e.radius * 0.45);
  const shellMat = mat(color, { wireframe: true, transparent: true, opacity: 0.35 });
  const shell = b.add(geo("ico2", () => new THREE.IcosahedronGeometry(1, 2)), shellMat, b.root, false);
  shell.scale.setScalar(e.radius * 1.6);
  return finish(b, (t) => {
    const y = e.hover + e.height * 0.6 + Math.sin(t) * 0.1;
    core.position.y = y;
    core.rotation.y = t * 0.4;
    lockRing.position.y = y;
    lockRing.rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.3, t * 0.5, 0);
    shackle.position.y = y + e.radius * 1.05;
    shell.position.y = y;
    shell.rotation.y = -t * 0.3;
    shell.visible = e.statuses.has("armored");
  }, ico);
}

function generic(color: string, e: Enemy): EnemyModel {
  const b = builder(color);
  const box = geo("box1", () => new THREE.BoxGeometry(1, 1, 1));
  const body = b.add(box, mat(color));
  body.scale.set(e.radius * 2, e.height, e.radius * 2);
  body.position.y = e.height / 2;
  return finish(b, () => {}, box);
}
