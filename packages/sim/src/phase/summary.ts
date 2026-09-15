import type { World } from "../world/world";

export interface PhaseSummary {
  phaseId: string;
  simTime: number;
  deaths: number;
  kills: number;
  killsStrong: number;
  accuracy: number;
  terminalsSolved: number;
  terminalsFirstTry: number;
  terminalAttempts: number;
  terminalCorrect: number;
  bytes: number;
  weaponsUsed: string[];
  fakePickups: number;
  mitmInterference: number;
  phishReported: number;
  flags: { noDeath: boolean; onlyBaseWeapon: boolean; noFakePickups: boolean; noMitmInterference: boolean };
}

export function phaseSummary(w: World): PhaseSummary {
  const s = w.stats;
  const baseIds = w.reg.weapons.filter((d) => d.base).map((d) => d.id);
  return {
    phaseId: w.phase.id,
    simTime: w.time,
    deaths: s.deaths,
    kills: s.killsTotal,
    killsStrong: s.killsStrong,
    accuracy: s.shots > 0 ? Math.min(1, s.hits / s.shots) : 0,
    terminalsSolved: s.terminalsSolved,
    terminalsFirstTry: s.terminalsFirstTry,
    terminalAttempts: s.terminalAttempts,
    terminalCorrect: s.terminalCorrect,
    bytes: w.sessionBytes,
    weaponsUsed: [...s.weaponsUsed],
    fakePickups: s.fakePickups,
    mitmInterference: s.mitmInterference,
    phishReported: s.phishReported,
    flags: {
      noDeath: s.deaths === 0,
      onlyBaseWeapon: s.weaponsUsed.every((id) => baseIds.includes(id)),
      noFakePickups: s.fakePickups === 0,
      noMitmInterference: s.mitmInterference === 0,
    },
  };
}
