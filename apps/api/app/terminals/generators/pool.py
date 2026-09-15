"""Geradores baseados em bancos de questões — espelho de generators/pool.ts."""

from __future__ import annotations

from typing import Any

from .common import GenContext, base, fill, filter_tagged, param, pick_vars, pool


def mc_pool(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, param(ctx, "pool", ""))
    items = filter_tagged(p.get("mc", []), param(ctx, "tags", None), param(ctx, "ids", None))
    q = ctx.rng.pick(items)
    variables = pick_vars(ctx.rng, q.get("vars"))
    n_options = param(ctx, "options", 4)
    wrong_pool = q.get("wrong", [])
    wrong = [fill(w, variables) for w in ctx.rng.sample(wrong_pool, min(n_options - 1, len(wrong_pool)))]
    correct = fill(q["correct"], variables)
    options = ctx.rng.shuffle([correct, *wrong])
    return {
        **base(ctx, "mc_pool"),
        "kind": "mc",
        "prompt": fill(q["prompt"], variables),
        "options": options,
        "answer": options.index(correct),
        "explanation": fill(q["explanation"], variables),
        "hint": fill(q.get("hint") or "", variables),
        "tags": param(ctx, "counterTags", []),
    }


def match_pool(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, param(ctx, "pool", ""))
    pairs = filter_tagged(p.get("pairs", []), param(ctx, "tags", None), None)
    count = min(param(ctx, "count", 4), len(pairs))
    chosen = ctx.rng.sample(pairs, count)
    idx = list(range(len(chosen)))
    right_order = ctx.rng.shuffle(idx)
    explanation = p.get("pairsExplanation")
    if explanation is None:
        explanation = " ".join(f"{c['left']}: {c['right']}." for c in chosen)
    return {
        **base(ctx, "match_pool"),
        "kind": "match",
        "prompt": p.get("pairsPrompt") if p.get("pairsPrompt") is not None else "Associe cada termo à sua definição.",
        "left": [c["left"] for c in chosen],
        "right": [chosen[i]["right"] for i in right_order],
        "answer": [right_order.index(i) for i in idx],
        "explanation": explanation,
        "hint": p.get("pairsHint") if p.get("pairsHint") is not None else "",
        "tags": param(ctx, "counterTags", []),
    }


def classify_pool(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, param(ctx, "pool", ""))
    cfg = p.get("classify")
    if cfg is None:
        raise ValueError("pool has no classify set")
    items = filter_tagged(cfg["items"], param(ctx, "tags", None), None)
    count = min(param(ctx, "count", 4), len(items))
    chosen = ctx.rng.sample(items, count)
    return {
        **base(ctx, "classify_pool"),
        "kind": "classify",
        "prompt": cfg["prompt"],
        "categories": cfg["categories"],
        "items": [{"text": c["text"], "detail": c.get("detail", [])} for c in chosen],
        "answer": [c["category"] for c in chosen],
        "itemExplanations": [c["explanation"] for c in chosen],
        "explanation": cfg["explanation"],
        "hint": cfg.get("hint") if cfg.get("hint") is not None else "",
        "tags": param(ctx, "counterTags", []),
    }
