import type { PhaseSummary } from "@fireshot/sim";
import { api } from "../api/client";
import type { AnswerRequest, AnswerResult, CompleteResult, SessionBackend, StartResult, TimedEvent } from "./backend";

/** Backend real: o servidor é a autoridade para XP, badges e conclusão. */
export class RemoteBackend implements SessionBackend {
  readonly online = true;

  async start(phaseId: string): Promise<StartResult> {
    return api.startPhase(phaseId);
  }

  async sendEvents(sessionId: string, events: TimedEvent[]): Promise<{ xpDelta: number; newBadges: { id: string; name: string }[] }> {
    if (events.length === 0) return { xpDelta: 0, newBadges: [] };
    const payload = events.map(({ event, clientTs }) => {
      const { type, ...rest } = event;
      return { type, clientTs, payload: rest };
    });
    const r = await api.sendEvents(sessionId, payload);
    return { xpDelta: r.xpDelta, newBadges: r.newBadges };
  }

  async answer(sessionId: string, req: AnswerRequest): Promise<AnswerResult> {
    const r = await api.answer(sessionId, req.terminalId, {
      challengeIndex: req.challengeIndex, attemptNo: req.attemptNo, answer: req.answer, tampered: req.tampered,
    });
    return { correct: r.correct, xpDelta: r.xpDelta, bytesDelta: r.bytesDelta, newBadges: r.newBadges };
  }

  async complete(sessionId: string, summary: PhaseSummary, elapsedS: number): Promise<CompleteResult> {
    const r = await api.complete(sessionId, summary, elapsedS);
    return { ...r, offline: false };
  }
}
