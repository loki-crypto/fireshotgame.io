import { describe, expect, it } from "vitest";
import { Grid, distanceField, findPath } from "../src";

describe("navegação", () => {
  const grid = new Grid([
    "#########",
    "#.......#",
    "#.#####.#",
    "#.#...#.#",
    "#.#.#.#.#",
    "#...#...#",
    "#########",
  ]);

  it("A* contorna paredes e chega ao destino", () => {
    const path = findPath(grid, [3, 3], [5, 3]);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual([5, 3]);
    for (const [c, r] of path) expect(grid.isWalkable(c, r)).toBe(true);
  });

  it("A* não corta quinas na diagonal", () => {
    const path = findPath(grid, [1, 1], [3, 3]);
    let prev: readonly [number, number] = [1, 1];
    for (const cell of path) {
      const dc = cell[0] - prev[0], dr = cell[1] - prev[1];
      if (dc !== 0 && dr !== 0) {
        expect(grid.isWalkable(prev[0] + dc, prev[1])).toBe(true);
        expect(grid.isWalkable(prev[0], prev[1] + dr)).toBe(true);
      }
      prev = cell;
    }
  });

  it("A* retorna vazio para destino inalcançável", () => {
    const g2 = new Grid(["#####", "#.#.#", "#####"]);
    expect(findPath(g2, [1, 1], [3, 1])).toEqual([]);
  });

  it("campo de distâncias cresce a partir do alvo e marca inalcançáveis como infinito", () => {
    const f = distanceField(grid, [1, 1]);
    expect(f[grid.cellIndex(1, 1)]).toBe(0);
    expect(f[grid.cellIndex(2, 1)]).toBe(1);
    expect(f[grid.cellIndex(0, 0)]).toBe(Infinity);
    expect(f[grid.cellIndex(5, 3)]!).toBeGreaterThan(f[grid.cellIndex(3, 1)]!);
  });
});
