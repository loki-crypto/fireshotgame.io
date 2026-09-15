import type { Cell, Grid } from "../core/grid";
import { lineOfSight, moveWithCollision } from "../core/grid";
import type { Vec3 } from "../core/vec";
import type { Enemy } from "../world/entities";
import type { World } from "../world/world";

const DIRS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Pode mover da célula (c,r) para (c+dc, r+dr) sem cortar quinas? */
export function canStep(grid: Grid, c: number, r: number, dc: number, dr: number): boolean {
  if (!grid.isWalkable(c + dc, r + dr)) return false;
  if (dc !== 0 && dr !== 0) return grid.isWalkable(c + dc, r) && grid.isWalkable(c, r + dr);
  return true;
}

/** Heap binário mínimo simples para Dijkstra/A*. */
class MinHeap {
  private keys: number[] = [];
  private prio: number[] = [];
  get size(): number { return this.keys.length; }
  push(k: number, p: number): void {
    this.keys.push(k); this.prio.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.prio[par]! <= this.prio[i]!) break;
      this.swap(i, par); i = par;
    }
  }
  pop(): number {
    const top = this.keys[0]!;
    const lastK = this.keys.pop()!, lastP = this.prio.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastK; this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.keys.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.keys.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}

/** Campo de distâncias (Dijkstra, 8 direções) a partir de uma célula alvo. */
export function distanceField(grid: Grid, target: Cell, out?: Float32Array): Float32Array {
  const n = grid.cols * grid.rows;
  const field = out && out.length === n ? out : new Float32Array(n);
  field.fill(Infinity);
  if (!grid.inBounds(target[0], target[1])) return field;
  const heap = new MinHeap();
  const start = grid.cellIndex(target[0], target[1]);
  field[start] = 0;
  heap.push(start, 0);
  while (heap.size > 0) {
    const k = heap.pop();
    const c = k % grid.cols, r = Math.floor(k / grid.cols);
    const d = field[k]!;
    for (const [dc, dr, cost] of DIRS) {
      // o alvo pode estar numa célula não caminhável (ex.: jogador encostado); expande mesmo assim
      if (!canStep(grid, c, r, dc, dr)) continue;
      const nk = grid.cellIndex(c + dc, r + dr);
      const nd = d + cost;
      if (nd < field[nk]!) { field[nk] = nd; heap.push(nk, nd); }
    }
  }
  return field;
}

/** A* em 8 direções sem cortar quinas. Retorna células do início (exclusivo) ao fim (inclusivo). */
export function findPath(grid: Grid, start: Cell, goal: Cell, maxExpanded = 5000): Cell[] {
  if (start[0] === goal[0] && start[1] === goal[1]) return [];
  if (!grid.isWalkable(goal[0], goal[1])) return [];
  const h = (c: number, r: number): number => {
    const dc = Math.abs(c - goal[0]), dr = Math.abs(r - goal[1]);
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  };
  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new MinHeap();
  const sk = grid.cellIndex(start[0], start[1]);
  const gk = grid.cellIndex(goal[0], goal[1]);
  g.set(sk, 0);
  heap.push(sk, h(start[0], start[1]));
  let expanded = 0;
  while (heap.size > 0 && expanded < maxExpanded) {
    const k = heap.pop();
    if (closed.has(k)) continue;
    closed.add(k);
    expanded++;
    if (k === gk) {
      const path: Cell[] = [];
      let cur = k;
      while (cur !== sk) {
        path.push([cur % grid.cols, Math.floor(cur / grid.cols)]);
        cur = parent.get(cur)!;
      }
      return path.reverse();
    }
    const c = k % grid.cols, r = Math.floor(k / grid.cols);
    for (const [dc, dr, cost] of DIRS) {
      if (!canStep(grid, c, r, dc, dr)) continue;
      const nk = grid.cellIndex(c + dc, r + dr);
      if (closed.has(nk)) continue;
      const ng = g.get(k)! + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        parent.set(nk, k);
        heap.push(nk, ng + h(c + dc, r + dr));
      }
    }
  }
  return [];
}

/** Atualiza o campo de distâncias até o jogador quando ele muda de célula ou o mapa muda. */
export function updatePlayerField(w: World): void {
  const [pc, pr] = w.grid.worldToCell(w.player.pos.x, w.player.pos.z);
  const key = w.grid.cellIndex(pc, pr);
  const n = w.grid.cols * w.grid.rows;
  if (w.nav.field.length !== n || w.nav.fieldCell !== key || w.nav.fieldVersion !== w.grid.version) {
    w.nav.field = distanceField(w.grid, [pc, pr], w.nav.field.length === n ? w.nav.field : undefined);
    w.nav.fieldCell = key;
    w.nav.fieldVersion = w.grid.version;
    w.nav.fieldTime = w.time;
  }
}

/** Move o inimigo em direção a um ponto, no plano XZ, com colisão e orientação. */
export function moveToward(w: World, e: Enemy, target: Vec3, speed: number, dt: number): number {
  const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-4) return 0;
  const step = Math.min(l, speed * dt);
  const mx = (dx / l) * step, mz = (dz / l) * step;
  faceToward(e, target);
  const next = moveWithCollision(w.grid, e.pos, mx, mz, e.radius);
  if (blockedByBarrier(w, e, next)) return 0;
  e.pos.x = next.x;
  e.pos.z = next.z;
  return step;
}

export function faceToward(e: Enemy, target: Vec3): void {
  const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
  if (Math.abs(dx) + Math.abs(dz) > 1e-6) e.yaw = Math.atan2(-dx, -dz);
}

/** Segue o campo de distâncias até o jogador (ou vai direto se houver visão livre por perto). */
export function chasePlayer(w: World, e: Enemy, speed: number, dt: number): void {
  const p = w.player.pos;
  const dist = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
  if (dist < 10 && lineOfSight(w.grid, { x: e.pos.x, y: 0.6, z: e.pos.z }, { x: p.x, y: 0.6, z: p.z })) {
    moveToward(w, e, p, speed, dt);
    return;
  }
  const grid = w.grid;
  const [c, r] = grid.worldToCell(e.pos.x, e.pos.z);
  let best = w.nav.field[grid.cellIndex(c, r)] ?? Infinity;
  let bestCell: Cell | null = null;
  for (const [dc, dr] of DIRS) {
    if (!canStep(grid, c, r, dc, dr)) continue;
    const v = w.nav.field[grid.cellIndex(c + dc, r + dr)]!;
    if (v < best) { best = v; bestCell = [c + dc, r + dr]; }
  }
  if (bestCell) moveToward(w, e, grid.cellToWorld(bestCell), speed, dt);
  else moveToward(w, e, p, speed, dt);
}

/** Vai até uma célula-objetivo usando A* com recálculo periódico. Retorna true ao chegar. */
export function goToCell(w: World, e: Enemy, goal: Cell, speed: number, dt: number): boolean {
  const grid = w.grid;
  const goalKey = grid.cellIndex(goal[0], goal[1]);
  const target = grid.cellToWorld(goal);
  if (Math.hypot(target.x - e.pos.x, target.z - e.pos.z) < 0.35) return true;
  e.repath -= dt;
  if (e.pathGoal !== goalKey || e.repath <= 0 || e.pathCursor >= e.path.length) {
    e.path = findPath(grid, grid.worldToCell(e.pos.x, e.pos.z), goal);
    e.pathCursor = 0;
    e.pathGoal = goalKey;
    e.repath = 1.0;
  }
  const next = e.path[e.pathCursor];
  if (!next) {
    moveToward(w, e, target, speed, dt);
    return false;
  }
  const wp = grid.cellToWorld(next);
  if (Math.hypot(wp.x - e.pos.x, wp.z - e.pos.z) < 0.3) {
    e.pathCursor++;
    return false;
  }
  moveToward(w, e, wp, speed, dt);
  return false;
}

/** Célula caminhável adjacente a uma célula sólida (para ficar ao lado de terminais/cofres). */
export function adjacentWalkable(grid: Grid, cell: Cell, prefer?: Vec3): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (const [dc, dr] of DIRS) {
    if (dc !== 0 && dr !== 0) continue;
    const nc = cell[0] + dc, nr = cell[1] + dr;
    if (!grid.isWalkable(nc, nr)) continue;
    const p = grid.cellToWorld([nc, nr]);
    const d = prefer ? Math.hypot(p.x - prefer.x, p.z - prefer.z) : 0;
    if (d < bestD) { bestD = d; best = [nc, nr]; }
  }
  return best;
}

/** Barreiras do Firewall Cannon: bloqueiam tráfego negado e controlam a vazão do permitido. */
export function blockedByBarrier(w: World, e: Enemy, next: Vec3): boolean {
  for (const b of w.barriers) {
    if (b.until <= w.time) continue;
    const before = (e.pos.x - b.center.x) * b.nx + (e.pos.z - b.center.z) * b.nz;
    const after = (next.x - b.center.x) * b.nx + (next.z - b.center.z) * b.nz;
    const margin = e.radius;
    const crossesPlane = (before > 0) !== (after > 0);
    const approaching = Math.abs(after) < Math.abs(before);
    const crossing = crossesPlane || (Math.abs(after) <= margin && approaching);
    if (!crossing) {
      if (e.passingBarrier === b.id && Math.abs(after) > margin * 2) e.passingBarrier = null;
      continue;
    }
    // dentro da largura da barreira?
    const tx = -b.nz, tz = b.nx;
    const lateral = (next.x - b.center.x) * tx + (next.z - b.center.z) * tz;
    if (Math.abs(lateral) > b.halfWidth + e.radius) continue;
    if (e.hover + e.height < 0 || e.hover > b.height) continue;
    if (e.passingBarrier === b.id) continue;
    const port = e.traffic;
    const allowed = port === null ? false : isPortAllowed(w, port);
    if (allowed && w.time >= b.nextPass) {
      b.nextPass = w.time + b.throttle;
      e.passingBarrier = b.id;
      w.events.push({ type: "barrier_blocked", pos: { ...e.pos }, allowed: true });
      continue;
    }
    if (w.tick % 20 === 0) w.events.push({ type: "barrier_blocked", pos: { ...e.pos }, allowed: false });
    return true;
  }
  return false;
}

function isPortAllowed(w: World, port: number): boolean {
  const rule = w.firewall.rules.find((r) => r.port === port);
  if (rule) return rule.action === "allow";
  return w.firewall.defaultPolicy === "allow";
}
