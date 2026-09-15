import type { MessageFactory } from "@fireshot/sim";
import { makeInboxMessage } from "@fireshot/sim";

/** Fábrica de mensagens do HUD baseada nos bancos de conteúdo (phishing vs. legítimas). */
export function createMessageFactory(pools: Record<string, unknown>): MessageFactory | null {
  if (!pools.phishing) return null;
  return (rng, kind) => makeInboxMessage(rng, kind, pools);
}
