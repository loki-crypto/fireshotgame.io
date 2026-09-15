import type { ClassifyQuestion, MatchQuestion, McQuestion } from "../types";
import { base, fill, param, pickVars, pool, type GenContext } from "./common";

export interface PoolMc {
  id: string;
  prompt: string;
  correct: string;
  wrong: string[];
  explanation: string;
  hint?: string;
  tags?: string[];
  vars?: Record<string, string[]>;
}

export interface PoolPair {
  left: string;
  right: string;
  tags?: string[];
}

export interface PoolItem {
  text: string;
  category: number;
  explanation: string;
  detail?: string[];
  tags?: string[];
}

interface PoolFile {
  mc?: PoolMc[];
  pairs?: PoolPair[];
  pairsPrompt?: string;
  pairsExplanation?: string;
  pairsHint?: string;
  classify?: { prompt: string; categories: string[]; explanation: string; hint?: string; items: PoolItem[] };
}

function filterTagged<T extends { tags?: string[]; id?: string }>(list: T[], tags: string[] | null, ids: string[] | null): T[] {
  let out = list;
  if (ids) out = out.filter((x) => x.id !== undefined && ids.includes(x.id));
  if (tags) out = out.filter((x) => (x.tags ?? []).some((t) => tags.includes(t)));
  if (out.length === 0) throw new Error("pool filter produced no items");
  return out;
}

/** Múltipla escolha a partir de um banco de questões com variáveis de template. */
export function mcPool(ctx: GenContext): McQuestion {
  const p = pool<PoolFile>(ctx, param(ctx, "pool", ""));
  const list = filterTagged(p.mc ?? [], param<string[] | null>(ctx, "tags", null), param<string[] | null>(ctx, "ids", null));
  const q = ctx.rng.pick(list);
  const vars = pickVars(ctx.rng, q.vars);
  const nOptions = param(ctx, "options", 4);
  const wrong = ctx.rng.sample(q.wrong, Math.min(nOptions - 1, q.wrong.length)).map((w) => fill(w, vars));
  const correct = fill(q.correct, vars);
  const options = ctx.rng.shuffle([correct, ...wrong]);
  return {
    ...base(ctx, "mc_pool"),
    kind: "mc",
    prompt: fill(q.prompt, vars),
    options,
    answer: options.indexOf(correct),
    explanation: fill(q.explanation, vars),
    hint: fill(q.hint ?? "", vars),
    tags: param<string[]>(ctx, "counterTags", []),
  };
}

/** Associação (termo ↔ definição) a partir de pares do banco. */
export function matchPool(ctx: GenContext): MatchQuestion {
  const p = pool<PoolFile>(ctx, param(ctx, "pool", ""));
  const pairs = filterTagged(p.pairs ?? [], param<string[] | null>(ctx, "tags", null), null);
  const count = Math.min(param(ctx, "count", 4), pairs.length);
  const chosen = ctx.rng.sample(pairs, count);
  const idx = chosen.map((_, i) => i);
  const rightOrder = ctx.rng.shuffle(idx);
  return {
    ...base(ctx, "match_pool"),
    kind: "match",
    prompt: p.pairsPrompt ?? "Associe cada termo à sua definição.",
    left: chosen.map((c) => c.left),
    right: rightOrder.map((i) => chosen[i]!.right),
    answer: idx.map((i) => rightOrder.indexOf(i)),
    explanation: p.pairsExplanation ?? chosen.map((c) => `${c.left}: ${c.right}.`).join(" "),
    hint: p.pairsHint ?? "",
    tags: param<string[]>(ctx, "counterTags", []),
  };
}

/** Classificação de itens do banco em categorias. */
export function classifyPool(ctx: GenContext): ClassifyQuestion {
  const p = pool<PoolFile>(ctx, param(ctx, "pool", ""));
  if (!p.classify) throw new Error("pool has no classify set");
  const items = filterTagged(p.classify.items, param<string[] | null>(ctx, "tags", null), null);
  const count = Math.min(param(ctx, "count", 4), items.length);
  const chosen = ctx.rng.sample(items, count);
  return {
    ...base(ctx, "classify_pool"),
    kind: "classify",
    prompt: p.classify.prompt,
    categories: p.classify.categories,
    items: chosen.map((c) => ({ text: c.text, detail: c.detail ?? [] })),
    answer: chosen.map((c) => c.category),
    itemExplanations: chosen.map((c) => c.explanation),
    explanation: p.classify.explanation,
    hint: p.classify.hint ?? "",
    tags: param<string[]>(ctx, "counterTags", []),
  };
}
