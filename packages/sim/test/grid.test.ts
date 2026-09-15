import { describe, expect, it } from "vitest";
import { CELL_CONSOLE, Grid, lineOfSight, moveWithCollision, raycastGrid } from "../src";

const g = () => new Grid([
  "#####",
  "#...#",
  "#.#.#",
  "#...#",
  "#####",
], 2, 3);

describe("grid", () => {
  it("interpreta paredes e limites", () => {
    const grid = g();
    expect(grid.cols).toBe(5);
    expect(grid.isSolid(0, 0)).toBe(true);
    expect(grid.isWalkable(1, 1)).toBe(true);
    expect(grid.isSolid(2, 2)).toBe(true);
    expect(grid.isSolid(-1, 3)).toBe(true);
    expect(grid.cellToWorld([1, 1])).toEqual({ x: 3, y: 0, z: 3 });
  });

  it("colisão desliza ao longo da parede sem atravessar", () => {
    const grid = g();
    let pos = { x: 3, y: 0, z: 3 };
    for (let i = 0; i < 100; i++) pos = moveWithCollision(grid, pos, -0.1, 0.02, 0.35);
    expect(pos.x).toBeGreaterThanOrEqual(2 + 0.35 - 1e-3);
    expect(pos.z).toBeGreaterThan(3);
    // não entra no pilar central (célula 2,2 => x∈[4,6], z∈[4,6])
    let p2 = { x: 3, y: 0, z: 5 };
    for (let i = 0; i < 100; i++) p2 = moveWithCollision(grid, p2, 0.2, 0, 0.35);
    expect(p2.x).toBeLessThanOrEqual(4 - 0.35 + 1e-3);
  });

  it("movimento grande em um passo não atravessa paredes (sub-passos)", () => {
    const grid = g();
    const p = moveWithCollision(grid, { x: 3, y: 0, z: 3 }, 10, 0, 0.35);
    expect(p.x).toBeLessThanOrEqual(8 - 0.35 + 1e-3);
  });

  it("raycast encontra a distância da parede", () => {
    const grid = g();
    const hit = raycastGrid(grid, { x: 3, y: 1.5, z: 3 }, { x: 1, y: 0, z: 0 }, 50);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(8 - 3, 5);
    expect(hit!.normal.x).toBe(-1);
  });

  it("raycast atinge chão e teto", () => {
    const grid = g();
    const down = raycastGrid(grid, { x: 3, y: 1.5, z: 3 }, { x: 0, y: -1, z: 0 }, 50);
    expect(down!.distance).toBeCloseTo(1.5);
    const up = raycastGrid(grid, { x: 3, y: 1.5, z: 3 }, { x: 0, y: 1, z: 0 }, 50);
    expect(up!.distance).toBeCloseTo(1.5);
  });

  it("consoles baixos bloqueiam andar mas não tiros na altura dos olhos", () => {
    const grid = new Grid(["#####", "#...#", "#####"], 2, 3);
    grid.set(2, 1, CELL_CONSOLE);
    expect(grid.isWalkable(2, 1)).toBe(false);
    const high = raycastGrid(grid, { x: 3, y: 1.6, z: 3 }, { x: 1, y: 0, z: 0 }, 50);
    expect(high!.distance).toBeCloseTo(5);
    const low = raycastGrid(grid, { x: 3, y: 0.8, z: 3 }, { x: 1, y: 0, z: 0 }, 50);
    expect(low!.distance).toBeCloseTo(1);
    expect(lineOfSight(grid, { x: 3, y: 1.6, z: 3 }, { x: 7, y: 1.6, z: 3 })).toBe(true);
  });
});
