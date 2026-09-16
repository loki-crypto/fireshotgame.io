"""Triagem de phishing — espelho de packages/sim/src/terminals/generators/phishing.ts.

`makeInboxMessage` (mensagens do HUD) não tem espelho: é conteúdo de jogo, não questão.
"""

from __future__ import annotations

import math
from typing import Any

from .common import GenContext, base, fill, param, pool


def phishing_classify(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, "phishing")
    rng = ctx.rng
    labels = p["labels"]
    classify = p["classify"]
    count = param(ctx, "count", 4)
    phish: list[dict[str, Any]] = p["messages"]["phish"]
    legit: list[dict[str, Any]] = p["messages"]["legit"]
    n_phish = min(math.ceil(count / 2), len(phish))
    n_legit = min(count - n_phish, len(legit))

    built = [{"m": m, "category": 0} for m in rng.sample(phish, n_phish)]
    built += [{"m": m, "category": 1} for m in rng.sample(legit, n_legit)]
    chosen = [built[i] for i in rng.shuffle(list(range(len(built))))]

    return {
        **base(ctx, "phishing_classify"),
        "kind": "classify",
        "prompt": classify["prompt"],
        "categories": classify["categories"],
        "items": [
            {
                "text": c["m"]["subject"],
                "detail": [fill(labels["from"], {"from": c["m"]["from"]}), c["m"]["body"]],
            }
            for c in chosen
        ],
        "answer": [c["category"] for c in chosen],
        "itemExplanations": [
            fill(
                labels["explanationTemplate"],
                {"explanation": c["m"]["explanation"], "signals": "; ".join(c["m"]["signals"])},
            )
            for c in chosen
        ],
        "explanation": classify["explanation"],
        "hint": classify["hint"],
        "tags": ["phishing_items"],
    }
