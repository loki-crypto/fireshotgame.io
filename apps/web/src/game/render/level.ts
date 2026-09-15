import * as THREE from "three";
import { CELL_WALL, type World } from "@fireshot/sim";
import { PALETTE, neon } from "./palette";
import { ceilingTexture, doorTexture, floorTexture, labelTexture, screenTexture, signTexture, wallTexture, drawScreen, type ScreenInfo } from "./textures";

export interface DoorView { id: string; meshes: THREE.Mesh[]; baseY: number; }
export interface TerminalView {
  id: string;
  group: THREE.Group;
  screenCtx: CanvasRenderingContext2D;
  screenTex: THREE.CanvasTexture;
  beacon: THREE.Mesh;
  light: THREE.Mesh;
  lastKey: string;
  seed: number;
}
export interface VaultView { id: string; group: THREE.Group; dial: THREE.Mesh; body: THREE.Mesh; cracked: boolean }
export interface ExitView { group: THREE.Group; beam: THREE.Mesh; ring: THREE.Mesh; open: boolean }
export interface SpawnerView { id: string; pad: THREE.Mesh; flash: number }

export interface LevelView {
  group: THREE.Group;
  doors: DoorView[];
  terminals: TerminalView[];
  vaults: VaultView[];
  exits: ExitView[];
  spawners: SpawnerView[];
  arenaMarks: Map<string, THREE.Mesh>;
  dispose(): void;
}

const FACE_DIRS: { dc: number; dr: number; }[] = [
  { dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
];

/** Constrói a geometria estática do nível (paredes mescladas, piso, teto, portas, consoles). */
export function buildLevel(w: World): LevelView {
  const { grid, phase } = w;
  const cs = grid.cellSize, H = grid.wallHeight;
  const accent = phase.ambient?.accent ?? PALETTE.accent;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };

  // piso e teto
  const W = grid.cols * cs, D = grid.rows * cs;
  const ftex = track(floorTexture(accent));
  ftex.repeat.set(grid.cols, grid.rows);
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(W, D)), track(new THREE.MeshBasicMaterial({ map: ftex })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  group.add(floor);
  const ctex = track(ceilingTexture());
  ctex.repeat.set(grid.cols, grid.rows);
  const ceil = new THREE.Mesh(track(new THREE.PlaneGeometry(W, D)), track(new THREE.MeshBasicMaterial({ map: ctex })));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, H, D / 2);
  group.add(ceil);

  // paredes: apenas faces expostas, mescladas em uma geometria
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const trim: number[] = [];
  let vi = 0;
  const eps = 0.012;
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    if (grid.get(c, r) !== CELL_WALL) continue;
    for (const { dc, dr } of FACE_DIRS) {
      const nc = c + dc, nr = r + dr;
      if (!grid.inBounds(nc, nr) || grid.get(nc, nr) === CELL_WALL) continue;
      // face na borda entre (c,r) e (nc,nr)
      let x0: number, z0: number, x1: number, z1: number;
      if (dr === -1) { x0 = (c + 1) * cs; z0 = r * cs; x1 = c * cs; z1 = r * cs; }
      else if (dr === 1) { x0 = c * cs; z0 = (r + 1) * cs; x1 = (c + 1) * cs; z1 = (r + 1) * cs; }
      else if (dc === -1) { x0 = c * cs; z0 = r * cs; x1 = c * cs; z1 = (r + 1) * cs; }
      else { x0 = (c + 1) * cs; z0 = (r + 1) * cs; x1 = (c + 1) * cs; z1 = r * cs; }
      pos.push(x0, 0, z0, x1, 0, z1, x1, H, z1, x0, H, z0);
      for (let k = 0; k < 4; k++) nor.push(dc, 0, dr);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
      const ox = dc * eps, oz = dr * eps;
      trim.push(x0 + ox, 0.04, z0 + oz, x1 + ox, 0.04, z1 + oz);
      trim.push(x0 + ox, H - 0.05, z0 + oz, x1 + ox, H - 0.05, z1 + oz);
      trim.push(x0 + ox, 1.25, z0 + oz, x1 + ox, 1.25, z1 + oz);
    }
  }
  const wg = track(new THREE.BufferGeometry());
  wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  wg.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  wg.setIndex(idx);
  const wtex = track(wallTexture(accent));
  const walls = new THREE.Mesh(wg, track(new THREE.MeshLambertMaterial({ map: wtex, color: 0xa8b8d8 })));
  group.add(walls);
  const tg = track(new THREE.BufferGeometry());
  tg.setAttribute("position", new THREE.Float32BufferAttribute(trim, 3));
  const trimColors: number[] = [];
  const ca = new THREE.Color(accent), cb = new THREE.Color(accent).multiplyScalar(0.35);
  for (let i = 0; i < trim.length / 6; i++) {
    const col = i % 3 === 2 ? cb : ca;
    trimColors.push(col.r, col.g, col.b, col.r, col.g, col.b);
  }
  tg.setAttribute("color", new THREE.Float32BufferAttribute(trimColors, 3));
  group.add(new THREE.LineSegments(tg, track(new THREE.LineBasicMaterial({ vertexColors: true }))));

  // portas
  const doorTex = track(doorTexture(PALETTE.danger));
  const doorMat = track(new THREE.MeshBasicMaterial({ map: doorTex }));
  const doors: DoorView[] = w.doors.map((d) => {
    const meshes = d.cells.map(([c, r]) => {
      const blocks = (cc: number, rr: number): boolean =>
        grid.get(cc, rr) === CELL_WALL || d.cells.some(([oc, or]) => oc === cc && or === rr);
      const spanX = blocks(c - 1, r) || blocks(c + 1, r) || !(blocks(c, r - 1) || blocks(c, r + 1));
      const geo = track(new THREE.BoxGeometry(spanX ? cs : 0.35, H, spanX ? 0.35 : cs));
      const m = new THREE.Mesh(geo, doorMat);
      const p = grid.cellToWorld([c, r]);
      m.position.set(p.x, H / 2, p.z);
      group.add(m);
      return m;
    });
    return { id: d.id, meshes, baseY: H / 2 };
  });

  // terminais
  const terminals: TerminalView[] = w.terminals.map((t, i) => {
    const g = new THREE.Group();
    const p = grid.cellToWorld(t.cell);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.atan2(t.facing.x, t.facing.z);
    const base = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 1.0, 0.9)), track(new THREE.MeshLambertMaterial({ color: 0x16243a })));
    base.position.y = 0.5;
    g.add(base);
    const seed = 1000 + i * 77;
    const info: ScreenInfo = { title: t.def.title, status: "available" };
    const { texture, ctx } = screenTexture(info, seed);
    track(texture);
    const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(1.4, 0.88)), track(new THREE.MeshBasicMaterial({ map: texture })));
    screen.position.set(0, 1.35, 0.15);
    screen.rotation.x = -0.35;
    g.add(screen);
    const edge = new THREE.LineSegments(track(new THREE.EdgesGeometry(base.geometry)), track(new THREE.LineBasicMaterial({ color: accent })));
    edge.position.copy(base.position);
    g.add(edge);
    const light = new THREE.Mesh(track(new THREE.TorusGeometry(0.22, 0.04, 6, 16)), neon(PALETTE.accent));
    light.position.set(0, 2.05, 0);
    g.add(light);
    const beacon = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, H - 2.2, 6, 1, true)), neon(PALETTE.accent, { additive: true, opacity: 0.5 }));
    beacon.position.set(0, 2.2 + (H - 2.2) / 2, 0);
    g.add(beacon);
    group.add(g);
    return { id: t.id, group: g, screenCtx: ctx, screenTex: texture, beacon, light, lastKey: "", seed };
  });

  // cofres
  const vaults: VaultView[] = w.vaults.map((v) => {
    const g = new THREE.Group();
    const p = grid.cellToWorld(v.cell);
    g.position.set(p.x, 0, p.z);
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(1.7, 1.9, 1.7)), track(new THREE.MeshLambertMaterial({ color: 0x2a3a52, emissive: 0x0a1830 })));
    body.position.y = 0.95;
    g.add(body);
    const dial = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 12)), neon("#9fd8ff"));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 1.1, 0.9);
    g.add(dial);
    const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(body.geometry)), track(new THREE.LineBasicMaterial({ color: "#9fd8ff" })));
    edges.position.copy(body.position);
    g.add(edges);
    const label = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: track(labelTexture("COFRE", "#9fd8ff")), transparent: true })));
    label.scale.set(1.6, 0.4, 1);
    label.position.y = 2.35;
    g.add(label);
    group.add(g);
    return { id: v.id, group: g, dial, body, cracked: false };
  });

  // saídas
  const exits: ExitView[] = w.zones.filter((z) => z.type === "exit").map((z) => {
    let sx = 0, sz = 0;
    for (const k of z.cells) {
      const p = grid.cellToWorld([k % grid.cols, Math.floor(k / grid.cols)]);
      sx += p.x; sz += p.z;
    }
    const n = z.cells.size;
    const g = new THREE.Group();
    g.position.set(sx / n, 0, sz / n);
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.7, 0.95, 32)), neon(PALETTE.danger, { transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(0.8, 0.8, H, 24, 1, true)), neon(PALETTE.danger, { additive: true, opacity: 0.18 }));
    beam.position.y = H / 2;
    g.add(beam);
    const label = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: track(labelTexture("SAÍDA", "#ffffff")), transparent: true, depthTest: false })));
    label.scale.set(1.8, 0.45, 1);
    label.position.y = 2.4;
    g.add(label);
    group.add(g);
    return { group: g, beam, ring, open: false };
  });

  // spawners
  const padGeo = track(new THREE.CircleGeometry(0.8, 6));
  const spawners: SpawnerView[] = w.spawners.map((s) => {
    const pad = new THREE.Mesh(padGeo, neon(PALETTE.danger, { transparent: true, opacity: 0.25 }).clone());
    track(pad.material as THREE.Material);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.pos.x, 0.02, s.pos.z);
    group.add(pad);
    return { id: s.id, pad, flash: 0 };
  });

  // marcações de arena
  const arenaMarks = new Map<string, THREE.Mesh>();
  for (const z of w.zones.filter((x) => x.type === "arena")) {
    const cellsPos: number[] = [];
    for (const k of z.cells) {
      const c = k % grid.cols, r = Math.floor(k / grid.cols);
      const x0 = c * cs + 0.15, x1 = (c + 1) * cs - 0.15, z0 = r * cs + 0.15, z1 = (r + 1) * cs - 0.15;
      cellsPos.push(x0, 0.015, z0, x1, 0.015, z0, x1, 0.015, z1, x0, 0.015, z0, x1, 0.015, z1, x0, 0.015, z1);
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(cellsPos, 3));
    const mark = new THREE.Mesh(geo, neon(PALETTE.warn, { transparent: true, opacity: 0.07 }));
    group.add(mark);
    arenaMarks.set(z.id, mark);
  }

  // placas holográficas
  for (const s of w.signs) {
    const { texture } = signTexture(s.text, accent);
    track(texture);
    const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: texture, transparent: true })));
    sprite.scale.set(2.6, 1.3, 1);
    sprite.position.set(s.pos.x, 1.9, s.pos.z);
    group.add(sprite);
  }

  return {
    group, doors, terminals, vaults, exits, spawners, arenaMarks,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export function updateTerminalScreen(view: TerminalView, info: ScreenInfo): void {
  const key = `${info.status}|${info.line ?? ""}`;
  if (key === view.lastKey) return;
  view.lastKey = key;
  drawScreen(view.screenCtx, info, view.seed);
  view.screenTex.needsUpdate = true;
  const color = { available: PALETTE.accent, locked: PALETTE.locked, solved: PALETTE.ok, corrupted: PALETTE.corrupt }[info.status];
  view.light.material = neon(color);
  view.beacon.material = neon(color, { additive: true, opacity: info.status === "solved" ? 0.12 : 0.5 });
}
