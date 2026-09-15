/**
 * PRNG determinístico (mulberry32) e hash FNV-1a de 32 bits.
 * O servidor (Python) implementa exatamente os mesmos algoritmos para revalidar
 * respostas de terminais a partir da seed. Não altere sem atualizar apps/api/app/terminals/rng.py
 * e regenerar as fixtures de conformidade.
 */
export interface Rng {
  /** [0, 1) */
  next(): number;
  /** inteiro em [min, max] (inclusivo) */
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  /** k elementos distintos, na ordem sorteada */
  sample<T>(arr: readonly T[], k: number): T[];
  chance(p: number): boolean;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const shuffle = <T>(arr: readonly T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  };
  return {
    next,
    int,
    pick: <T>(arr: readonly T[]): T => {
      if (arr.length === 0) throw new Error("pick on empty array");
      return arr[Math.floor(next() * arr.length)]!;
    },
    shuffle,
    sample: <T>(arr: readonly T[], k: number): T[] => shuffle(arr).slice(0, k),
    chance: (p: number): boolean => next() < p,
  };
}

/** FNV-1a 32 bits sobre os bytes UTF-8 da string. */
export function fnv1a32(input: string): number {
  const bytes = new TextEncoder().encode(input);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Seed de uma questão: depende da sessão, do terminal, do desafio e da tentativa. */
export function questionSeed(sessionSeed: number, terminalId: string, challengeIndex: number, attemptNo: number): number {
  return fnv1a32(`${sessionSeed >>> 0}|${terminalId}|${challengeIndex}|${attemptNo}`);
}
