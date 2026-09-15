import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkAnswer, fnv1a32, generateQuestion, mulberry32, questionSeed } from "@fireshot/sim";
import { phases, pools } from "../index";
import { canonicalJson, sampleAnswers, sha256 } from "./canonical";

/**
 * Fixtures de conformidade TS → Python (apps/api/tests/test_conformance.py).
 * Regenerar após mudar geradores, bancos ou fases: UPDATE_FIXTURES=1 pnpm --filter @fireshot/content test
 */
const DIR = resolve(__dirname, "../fixtures/generators");
const UPDATE = process.env.UPDATE_FIXTURES === "1";
const SEEDS = 200;
const SAMPLES = 12;

const seedAt = (i: number): number => (i * 2654435761) >>> 0;

function buildTerminalFixture(phaseId: string, terminalId: string, generator: string, params: Record<string, unknown> | undefined) {
  const seeds: { seed: number; sha256: string }[] = [];
  const samples: { seed: number; question: unknown; checks: { answer: unknown; result: unknown }[] }[] = [];
  for (let i = 1; i <= SEEDS; i++) {
    const seed = seedAt(i);
    const q = generateQuestion(generator, params, seed, pools);
    seeds.push({ seed, sha256: sha256(canonicalJson(q)) });
    if (i <= SAMPLES) {
      samples.push({ seed, question: q, checks: sampleAnswers(q).map((answer) => ({ answer, result: checkAnswer(q, answer) })) });
    }
  }
  return { source: `${phaseId}/${terminalId}`, generator, params: params ?? {}, seeds, samples };
}

function buildRngFixture() {
  const sequences = [0, 1, 42, 0x9e3779b9, 0xffffffff, 123456789].map((seed) => {
    const rng = mulberry32(seed);
    return { seed, next: Array.from({ length: 16 }, () => rng.next()) };
  });
  const rng = mulberry32(7);
  const ops = {
    int: Array.from({ length: 10 }, () => rng.int(-5, 17)),
    pick: Array.from({ length: 10 }, () => rng.pick(["a", "b", "c", "d"])),
    shuffle: rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8]),
    sample: rng.sample([10, 20, 30, 40, 50], 3),
    chance: Array.from({ length: 10 }, () => rng.chance(0.3)),
  };
  const strings = ["", "a", "fireshot", "Olá, açúcar!", "🔥 rede", "123|t1|0|1"];
  return {
    sequences,
    ops,
    fnv1a32: strings.map((s) => ({ input: s, hash: fnv1a32(s) })),
    questionSeed: [[1, "t1", 0, 1], [4294967295, "term-x", 2, 3], [123456, "ação", 1, 9]].map(([s, t, c, a]) => ({
      sessionSeed: s, terminalId: t, challengeIndex: c, attemptNo: a, seed: questionSeed(s as number, t as string, c as number, a as number),
    })),
  };
}

function writeOrCompare(file: string, data: unknown): void {
  const path = join(DIR, file);
  const text = `${JSON.stringify(data, null, 1)}\n`;
  if (UPDATE) {
    writeFileSync(path, text);
    return;
  }
  expect(existsSync(path), `fixture ausente: ${file} (rode com UPDATE_FIXTURES=1)`).toBe(true);
  const current = JSON.parse(readFileSync(path, "utf8"));
  expect(current, `fixture desatualizada: ${file} (rode com UPDATE_FIXTURES=1)`).toEqual(JSON.parse(text));
}

describe("fixtures de conformidade dos geradores", () => {
  if (UPDATE) {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
  }

  it("rng.json (mulberry32, fnv1a32, questionSeed)", () => writeOrCompare("rng.json", buildRngFixture()));

  const expected = new Set<string>(["rng.json"]);
  for (const p of phases) {
    for (const t of p.terminals) {
      const file = `${p.id}__${t.id}.json`;
      expected.add(file);
      it(file, () => writeOrCompare(file, buildTerminalFixture(p.id, t.id, t.generator, t.params)));
    }
  }

  it("não há fixtures órfãs", () => {
    if (UPDATE) return;
    const files = existsSync(DIR) ? readdirSync(DIR) : [];
    expect(files.filter((f) => !expected.has(f))).toEqual([]);
  });
});
