import { describe, expect, it } from "vitest";
import { fnv1a32, mulberry32, questionSeed } from "../src";

describe("rng", () => {
  it("mulberry32 é determinístico e em [0,1)", () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("valores de referência fixos (usados na conformidade com o servidor Python)", () => {
    const r = mulberry32(12345);
    const vals = [r.next(), r.next(), r.next()];
    expect(vals.map((v) => Math.floor(v * 1e9))).toMatchInlineSnapshot(`
      [
        979728267,
        306752264,
        484205421,
      ]
    `);
  });

  it("int, pick, shuffle e sample respeitam limites", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
    const arr = [1, 2, 3, 4, 5, 6];
    const sh = r.shuffle(arr);
    expect([...sh].sort()).toEqual(arr);
    expect(new Set(r.sample(arr, 4)).size).toBe(4);
    expect(arr).toContain(r.pick(arr));
  });

  it("fnv1a32 bate com vetores conhecidos", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
    expect(fnv1a32("ação")).toBe(fnv1a32("ação"));
  });

  it("questionSeed muda com a tentativa", () => {
    expect(questionSeed(1, "t1", 0, 1)).not.toBe(questionSeed(1, "t1", 0, 2));
    expect(questionSeed(1, "t1", 0, 1)).toBe(questionSeed(1, "t1", 0, 1));
  });
});
