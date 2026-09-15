import type { GameEvent, PhaseSummary } from "@fireshot/sim";

export interface BadgeAward {
  id: string;
  name: string;
}

export interface StartResult {
  sessionId: string;
  seed: number;
  equippedUpgrades: string[];
}

export interface AnswerRequest {
  terminalId: string;
  challengeIndex: number;
  attemptNo: number;
  answer: unknown;
  tampered: boolean;
}

export interface AnswerResult {
  correct: boolean;
  xpDelta: number;
  bytesDelta: number;
  newBadges: BadgeAward[];
}

export interface RewardLine {
  key: string;
  xp: number;
  bytes: number;
}

export interface CompleteResult {
  accepted: boolean;
  reasons: string[];
  xpDelta: number;
  bytesDelta: number;
  xp: number;
  level: number;
  leveledUp: boolean;
  newBadges: BadgeAward[];
  breakdown: RewardLine[];
  offline: boolean;
}

export interface TimedEvent {
  event: GameEvent;
  clientTs: string;
}

/** Abstração do backend de uma sessão de fase (servidor real ou modo local sem conta). */
export interface SessionBackend {
  readonly online: boolean;
  start(phaseId: string): Promise<StartResult>;
  sendEvents(sessionId: string, events: TimedEvent[]): Promise<{ xpDelta: number; newBadges: BadgeAward[] }>;
  answer(sessionId: string, req: AnswerRequest): Promise<AnswerResult>;
  /** `elapsedS`: tempo de jogo da tentativa (sem pausas e briefing), limitado pelo servidor ao tempo real da sessão */
  complete(sessionId: string, summary: PhaseSummary, elapsedS: number): Promise<CompleteResult>;
}

/** Backend local (sem conta / laboratório): seed aleatória, nada é persistido. */
export class LocalBackend implements SessionBackend {
  readonly online = false;
  constructor(private equipped: string[] = []) {}

  async start(): Promise<StartResult> {
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now()) >>> 0;
    return { sessionId: `local-${seed.toString(36)}`, seed, equippedUpgrades: this.equipped };
  }

  async sendEvents(): Promise<{ xpDelta: number; newBadges: BadgeAward[] }> {
    return { xpDelta: 0, newBadges: [] };
  }

  async answer(): Promise<AnswerResult> {
    return { correct: false, xpDelta: 0, bytesDelta: 0, newBadges: [] };
  }

  async complete(): Promise<CompleteResult> {
    return { accepted: true, reasons: [], xpDelta: 0, bytesDelta: 0, xp: 0, level: 1, leveledUp: false, newBadges: [], breakdown: [], offline: true };
  }
}
