import type { Rng } from "../../core/rng";
import type { MessageContent } from "../../world/world";

/** Gera o conteúdo de uma mensagem de HUD (phishing ou legítima) a partir do banco "phishing". */
export function makeInboxMessage(rng: Rng, kind: "phish" | "legit", pools: Record<string, unknown>): MessageContent {
  void rng; void kind;
  if (!pools.phishing) throw new Error("pool phishing ausente");
  throw new Error("gerador de mensagens ainda não implementado");
}
