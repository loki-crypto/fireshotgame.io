import { record, emit, type World } from "../world/world";
import { applyEffects } from "../world/effects";
import { saveCheckpoint } from "../world/checkpoint";
import { interceptorOf } from "../enemies/behaviors/mitm";
import type { TerminalEntity } from "../world/entities";

export type TerminalAccess =
  | { ok: true; terminal: TerminalEntity; challengeIndex: number; attemptNo: number; interceptedBy: string | null }
  | { ok: false; reason: "not_found" | "solved" | "locked" | "corrupted"; missing?: string[] };

const INTERACT_RANGE = 2.7;

/** Terminal mais próximo à frente do jogador, dentro do alcance de interação. */
export function findFocusTerminal(w: World): string | null {
  const p = w.player;
  if (!p.alive) return null;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  let best: string | null = null;
  let bestScore = Infinity;
  for (const t of w.terminals) {
    const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > INTERACT_RANGE + 0.6) continue;
    const facing = d > 1e-6 ? (dx * fx + dz * fz) / d : 1;
    if (facing < 0.35) continue;
    const score = d - facing;
    if (score < bestScore) { bestScore = score; best = t.id; }
  }
  return best;
}

export function terminalAccess(w: World, id: string): TerminalAccess {
  const t = w.terminals.find((x) => x.id === id);
  if (!t) return { ok: false, reason: "not_found" };
  if (t.solved) return { ok: false, reason: "solved" };
  const missing = (t.def.requires ?? []).filter((rid) => !w.terminals.find((x) => x.id === rid)?.solved);
  if (missing.length > 0) return { ok: false, reason: "locked", missing };
  if (t.corrupted) return { ok: false, reason: "corrupted" };
  return { ok: true, terminal: t, challengeIndex: t.solvedChallenges, attemptNo: t.attemptsOnChallenge + 1, interceptedBy: interceptorOf(w, id) };
}

export interface TerminalOutcome {
  solvedChallenge: boolean;
  solvedTerminal: boolean;
  firstTryTerminal: boolean;
}

/** Registra o resultado de uma resposta (já verificada) e aplica efeitos ao resolver o terminal. */
export function applyTerminalResult(w: World, id: string, correct: boolean, tampered: boolean): TerminalOutcome {
  const t = w.terminals.find((x) => x.id === id);
  if (!t || t.solved) return { solvedChallenge: false, solvedTerminal: false, firstTryTerminal: false };
  w.stats.terminalAttempts++;
  t.totalAttempts++;
  t.attemptsOnChallenge++;
  if (tampered) {
    w.stats.mitmInterference++;
    record(w, { type: "mitm_interference", t: w.time, terminalId: id });
  }
  if (!correct) {
    t.firstTry = false;
    return { solvedChallenge: false, solvedTerminal: false, firstTryTerminal: false };
  }
  w.stats.terminalCorrect++;
  t.solvedChallenges++;
  t.attemptsOnChallenge = 0;
  if (t.solvedChallenges < t.def.challenges) return { solvedChallenge: true, solvedTerminal: false, firstTryTerminal: false };
  t.solved = true;
  w.stats.terminalsSolved++;
  if (t.firstTry) w.stats.terminalsFirstTry++;
  emit(w, { type: "terminal_solved", terminalId: id });
  applyEffects(w, t.def.onSolve);
  saveCheckpoint(w, "terminal");
  return { solvedChallenge: true, solvedTerminal: true, firstTryTerminal: t.firstTry };
}
