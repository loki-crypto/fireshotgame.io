/**
 * Regras de XP. O servidor é a autoridade (apps/api/app/services/xp.py usa os mesmos valores);
 * o cliente usa esta cópia apenas para exibir previsões.
 */
export const XP_RULES = {
  kill: 5,
  killStrongBonus: 3,
  /** terminal resolvido com todos os desafios na primeira tentativa */
  terminalFirstTry: 60,
  terminalLater: 20,
  /** toda conclusão aceita */
  phaseComplete: 50,
  /** extra na primeira conclusão da fase (primeira vez: 150 XP no total) */
  firstCompletion: 100,
  noDeathBonus: 50,
  parTimeBonus: 50,
  phishReported: 10,
} as const;

export const BYTES_RULES = {
  terminalFirstTry: 10,
  phaseComplete: 10,
  /** primeira vez: 50 bytes no total */
  firstCompletion: 40,
} as const;

/** XP necessário para subir do nível n para n+1: floor(100 · n^1.5). */
export const xpForLevel = (n: number): number => Math.floor(100 * Math.pow(n, 1.5));

export interface LevelInfo {
  level: number;
  /** XP acumulado dentro do nível atual */
  intoLevel: number;
  /** XP necessário para o próximo nível */
  needed: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, intoLevel: remaining, needed: xpForLevel(level) };
}
