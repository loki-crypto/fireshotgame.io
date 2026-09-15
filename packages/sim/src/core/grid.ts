import type { Vec3 } from "./vec";

export type Cell = readonly [number, number]; // [col, row] => eixo X, eixo Z

export const CELL_FLOOR = 0;
export const CELL_WALL = 1;
export const CELL_DOOR = 2;
export const CELL_CONSOLE = 3;
export const CELL_VAULT = 4;

export type CellKind = typeof CELL_FLOOR | typeof CELL_WALL | typeof CELL_DOOR | typeof CELL_CONSOLE | typeof CELL_VAULT;

export interface GridGlyph {
  glyph: string;
  cell: Cell;
}

/**
 * Mapa em grade. '#' é parede; '.' e espaço são chão; demais glifos são coletados em `glyphs`
 * para o loader transformar em entidades (portas, terminais, inimigos…).
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly kind: Uint8Array;
  readonly glyphs: GridGlyph[] = [];
  /** incrementado a cada mudança de célula (portas abrindo) — invalida caches de navegação */
  version = 0;

  constructor(
    readonly ascii: readonly string[],
    readonly cellSize = 2,
    readonly wallHeight = 3.2,
  ) {
    this.rows = ascii.length;
    this.cols = Math.max(0, ...ascii.map((r) => r.length));
    this.kind = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      const line = ascii[r] ?? "";
      for (let c = 0; c < this.cols; c++) {
        const ch = line[c] ?? "#";
        if (ch === "#") this.kind[r * this.cols + c] = CELL_WALL;
        else if (ch !== "." && ch !== " ") this.glyphs.push({ glyph: ch, cell: [c, r] });
      }
    }
  }

  inBounds(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  get(c: number, r: number): number {
    if (!this.inBounds(c, r)) return CELL_WALL;
    return this.kind[r * this.cols + c]!;
  }

  set(c: number, r: number, k: CellKind): void {
    if (!this.inBounds(c, r)) return;
    if (this.kind[r * this.cols + c] !== k) {
      this.kind[r * this.cols + c] = k;
      this.version++;
    }
  }

  isSolid(c: number, r: number): boolean {
    return this.get(c, r) !== CELL_FLOOR;
  }

  isWalkable(c: number, r: number): boolean {
    return this.get(c, r) === CELL_FLOOR;
  }

  /** Altura do obstáculo na célula (0 = livre). Consoles são baixos e não bloqueiam tiros acima deles. */
  heightAt(c: number, r: number): number {
    switch (this.get(c, r)) {
      case CELL_FLOOR: return 0;
      case CELL_CONSOLE: return 1.15;
      case CELL_VAULT: return 1.9;
      default: return this.wallHeight;
    }
  }

  worldToCell(x: number, z: number): Cell {
    return [Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)];
  }

  cellIndex(c: number, r: number): number {
    return r * this.cols + c;
  }

  /** Centro da célula, no chão (y = 0). */
  cellToWorld(cell: Cell): Vec3 {
    return { x: (cell[0] + 0.5) * this.cellSize, y: 0, z: (cell[1] + 0.5) * this.cellSize };
  }

  /** Um quadrado de meia-largura `radius` centrado em (x,z) intersecta célula sólida? */
  overlapsSolid(x: number, z: number, radius: number): boolean {
    const [c0, r0] = this.worldToCell(x - radius, z - radius);
    const [c1, r1] = this.worldToCell(x + radius, z + radius);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.isSolid(c, r)) return true;
    return false;
  }

  /** Célula caminhável mais próxima (busca em espiral), útil para posicionar spawns. */
  nearestWalkable(cell: Cell, maxRadius = 6): Cell | null {
    if (this.isWalkable(cell[0], cell[1])) return cell;
    for (let rad = 1; rad <= maxRadius; rad++) {
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        if (this.isWalkable(cell[0] + dc, cell[1] + dr)) return [cell[0] + dc, cell[1] + dr];
      }
    }
    return null;
  }
}

/** Move um corpo (quadrado de meia-largura `radius`) no plano XZ com deslize contra paredes, eixo a eixo. */
export function moveWithCollision(grid: Grid, pos: Vec3, dx: number, dz: number, radius: number): Vec3 {
  const maxStep = Math.max(0.05, radius * 0.9);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / maxStep));
  const sx = dx / steps, sz = dz / steps;
  const out = { ...pos };
  const eps = 1e-4;
  const cs = grid.cellSize;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      let nx = out.x + sx;
      if (grid.overlapsSolid(nx, out.z, radius)) {
        nx = sx > 0 ? Math.floor((nx + radius) / cs) * cs - radius - eps : Math.floor((nx - radius) / cs + 1) * cs + radius + eps;
        if (grid.overlapsSolid(nx, out.z, radius)) nx = out.x;
      }
      out.x = nx;
    }
    if (sz !== 0) {
      let nz = out.z + sz;
      if (grid.overlapsSolid(out.x, nz, radius)) {
        nz = sz > 0 ? Math.floor((nz + radius) / cs) * cs - radius - eps : Math.floor((nz - radius) / cs + 1) * cs + radius + eps;
        if (grid.overlapsSolid(out.x, nz, radius)) nz = out.z;
      }
      out.z = nz;
    }
  }
  return out;
}

export interface GridRayHit {
  distance: number;
  point: Vec3;
  normal: Vec3;
  cell: Cell | null;
}

const at = (o: Vec3, d: Vec3, t: number): Vec3 => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t });

/**
 * Raycast 3D contra a grade (DDA no plano XZ), respeitando a altura de cada célula,
 * e contra chão (y=0) e teto (y=wallHeight). `dir` deve estar normalizado.
 */
export function raycastGrid(grid: Grid, origin: Vec3, dir: Vec3, maxDist: number): GridRayHit | null {
  let best: GridRayHit | null = null;
  if (dir.y < -1e-9) {
    const t = -origin.y / dir.y;
    if (t >= 0 && t <= maxDist) best = { distance: t, point: at(origin, dir, t), normal: { x: 0, y: 1, z: 0 }, cell: null };
  } else if (dir.y > 1e-9) {
    const t = (grid.wallHeight - origin.y) / dir.y;
    if (t >= 0 && t <= maxDist) best = { distance: t, point: at(origin, dir, t), normal: { x: 0, y: -1, z: 0 }, cell: null };
  }
  const limit = best ? best.distance : maxDist;

  const cs = grid.cellSize;
  let [c, r] = grid.worldToCell(origin.x, origin.z);
  const stepC = dir.x > 1e-12 ? 1 : dir.x < -1e-12 ? -1 : 0;
  const stepR = dir.z > 1e-12 ? 1 : dir.z < -1e-12 ? -1 : 0;
  const tDeltaC = stepC !== 0 ? Math.abs(cs / dir.x) : Infinity;
  const tDeltaR = stepR !== 0 ? Math.abs(cs / dir.z) : Infinity;
  let tMaxC = stepC > 0 ? ((c + 1) * cs - origin.x) / dir.x : stepC < 0 ? (c * cs - origin.x) / dir.x : Infinity;
  let tMaxR = stepR > 0 ? ((r + 1) * cs - origin.z) / dir.z : stepR < 0 ? (r * cs - origin.z) / dir.z : Infinity;

  // origem dentro de célula sólida (ex.: acima de um console)
  let tEnter = 0;
  const testCell = (cc: number, rr: number, tIn: number, normal: Vec3): GridRayHit | null => {
    const h = grid.heightAt(cc, rr);
    if (h <= 0) return null;
    const yIn = origin.y + dir.y * tIn;
    if (yIn <= h) return { distance: tIn, point: at(origin, dir, tIn), normal, cell: [cc, rr] };
    // o raio desce abaixo do topo dentro da célula?
    if (dir.y < 0) {
      const tTop = (h - origin.y) / dir.y;
      const tOut = Math.min(tMaxC, tMaxR);
      if (tTop >= tIn && tTop <= tOut) return { distance: tTop, point: at(origin, dir, tTop), normal: { x: 0, y: 1, z: 0 }, cell: [cc, rr] };
    }
    return null;
  };

  const first = testCell(c, r, tEnter, { x: 0, y: 0, z: 0 });
  if (first && first.distance <= limit) return first;

  for (let i = 0; i < 4096; i++) {
    let normal: Vec3;
    if (tMaxC < tMaxR) {
      tEnter = tMaxC; c += stepC; tMaxC += tDeltaC; normal = { x: -stepC, y: 0, z: 0 };
    } else {
      tEnter = tMaxR; r += stepR; tMaxR += tDeltaR; normal = { x: 0, y: 0, z: -stepR };
    }
    if (tEnter > limit || !Number.isFinite(tEnter)) break;
    if (!grid.inBounds(c, r)) return { distance: tEnter, point: at(origin, dir, tEnter), normal, cell: null };
    const hit = testCell(c, r, tEnter, normal);
    if (hit && hit.distance <= limit) return hit;
  }
  return best;
}

/** Linha de visão entre dois pontos 3D (sem considerar entidades). */
export function lineOfSight(grid: Grid, from: Vec3, to: Vec3): boolean {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const hit = raycastGrid(grid, from, { x: dx / len, y: dy / len, z: dz / len }, len);
  return hit === null || hit.distance >= len - 1e-3;
}
