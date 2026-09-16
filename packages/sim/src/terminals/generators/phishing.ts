import type { Rng } from "../../core/rng";
import type { MessageContent } from "../../world/world";
import type { ClassifyQuestion } from "../types";
import { base, fill, param, pool, type GenContext } from "./common";

interface MessageDef {
  id: string;
  from: string;
  subject: string;
  body: string;
  signals: string[];
  explanation: string;
}

interface PhishingPool {
  labels: { from: string; signalsTitle: string; explanationTemplate: string };
  messages: { phish: MessageDef[]; legit: MessageDef[] };
  classify: { prompt: string; categories: string[]; explanation: string; hint: string };
}

/** Conteúdo de uma mensagem do HUD (isca de phishing ou comunicado legítimo). */
export function makeInboxMessage(rng: Rng, kind: "phish" | "legit", pools: Record<string, unknown>): MessageContent {
  const p = pools.phishing as PhishingPool | undefined;
  if (!p) throw new Error("pool phishing ausente");
  const m = rng.pick(p.messages[kind]);
  return { from: m.from, subject: m.subject, body: m.body, signals: [...m.signals] };
}

/**
 * Triagem de caixa de entrada: metade das mensagens é fraude.
 * Os itens mostram só o que o jogador veria (remetente, assunto, corpo);
 * os sinais ficam na explicação de cada item.
 */
export function phishingClassify(ctx: GenContext): ClassifyQuestion {
  const P = pool<PhishingPool>(ctx, "phishing");
  const rng = ctx.rng;
  const count = param(ctx, "count", 4);
  const nPhish = Math.min(Math.ceil(count / 2), P.messages.phish.length);
  const nLegit = Math.min(count - nPhish, P.messages.legit.length);

  const built = [
    ...rng.sample(P.messages.phish, nPhish).map((m) => ({ m, category: 0 })),
    ...rng.sample(P.messages.legit, nLegit).map((m) => ({ m, category: 1 })),
  ];
  const chosen = rng.shuffle(built.map((_, i) => i)).map((i) => built[i]!);

  return {
    ...base(ctx, "phishing_classify"),
    kind: "classify",
    prompt: P.classify.prompt,
    categories: P.classify.categories,
    items: chosen.map(({ m }) => ({
      text: m.subject,
      detail: [fill(P.labels.from, { from: m.from }), m.body],
    })),
    answer: chosen.map((c) => c.category),
    itemExplanations: chosen.map(({ m }) =>
      fill(P.labels.explanationTemplate, { explanation: m.explanation, signals: m.signals.join("; ") }),
    ),
    explanation: P.classify.explanation,
    hint: P.classify.hint,
    tags: ["phishing_items"],
  };
}
