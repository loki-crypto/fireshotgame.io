"""Força de senhas — espelho de packages/sim/src/terminals/generators/passwords.ts."""

from __future__ import annotations

import math
from typing import Any

from ..rng import Rng
from .common import GenContext, base, fill, param, pool

LEET = {"a": "4", "e": "3", "i": "1", "o": "0", "s": "5"}
DIGIT_SUFFIXES = ["123", "1234", "12345", "2024"]


def char_classes(s: str) -> int:
    """Quantos dos 4 tipos de caractere aparecem (comparações ASCII, como no TS)."""
    lower = upper = digit = symbol = False
    for c in s:
        if "a" <= c <= "z":
            lower = True
        elif "A" <= c <= "Z":
            upper = True
        elif "0" <= c <= "9":
            digit = True
        else:
            symbol = True
    return sum((lower, upper, digit, symbol))


def _leet(word: str) -> str:
    return "".join(LEET.get(c, c) for c in word)


def _capitalize(word: str) -> str:
    """String.prototype.toUpperCase() só na primeira posição (palavras ASCII)."""
    return word if not word else word[0].upper() + word[1:]


def _chars(rng: Rng, alphabet: str, n: int) -> str:
    items = list(alphabet)
    return "".join(rng.pick(items) for _ in range(n))


def _build_password(rng: Rng, p: dict[str, Any], recipe_id: str) -> str:
    if recipe_id == "word-year":
        return rng.pick(p["words"]) + str(rng.int(1990, 2026))
    if recipe_id == "name-digits":
        return rng.pick(p["names"]) + rng.pick(DIGIT_SUFFIXES)
    if recipe_id == "sequence":
        return rng.pick(p["sequences"])
    if recipe_id == "short-random":
        return _chars(rng, p["lowercase"], 6)
    if recipe_id == "leet-word":
        return _leet(_capitalize(rng.pick(p["words"]))) + rng.pick(list(p["symbols"]))
    if recipe_id == "passphrase":
        return "-".join(rng.sample(p["passphraseWords"], 4)) + f"-{rng.int(10, 99)}"
    if recipe_id == "random-long":
        return _chars(rng, p["randomAlphabet"], 16)
    if recipe_id == "mixed":
        first = _capitalize(rng.pick(p["passphraseWords"]))
        second = rng.pick(p["passphraseWords"])
        return f"{first}_{second}#{rng.int(100, 999)}{rng.pick(list(p['symbols']))}"
    raise ValueError(f"unknown password recipe: {recipe_id}")


def _make_item(rng: Rng, p: dict[str, Any], recipe: dict[str, Any], category: int) -> dict[str, Any]:
    password = _build_password(rng, p, recipe["id"])
    variables = {"len": str(len(password)), "classes": str(char_classes(password))}
    templates = p["detailTemplates"]
    return {
        "item": {
            "text": password,
            "detail": [fill(templates.get(key, key), variables) for key in recipe["details"]],
        },
        "explanation": recipe["explanation"],
        "category": category,
    }


def password_strength(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, "passwords")["strength"]
    rng = ctx.rng
    count = param(ctx, "count", 4)
    n_weak = min(math.ceil(count / 2), len(p["weakRecipes"]))
    n_strong = min(count - n_weak, len(p["strongRecipes"]))

    built = [_make_item(rng, p, r, 0) for r in rng.sample(p["weakRecipes"], n_weak)]
    built += [_make_item(rng, p, r, 1) for r in rng.sample(p["strongRecipes"], n_strong)]
    order = rng.shuffle(list(range(len(built))))
    chosen = [built[i] for i in order]

    return {
        **base(ctx, "password_strength"),
        "kind": "classify",
        "prompt": p["prompt"],
        "categories": p["categories"],
        "items": [c["item"] for c in chosen],
        "answer": [c["category"] for c in chosen],
        "itemExplanations": [c["explanation"] for c in chosen],
        "explanation": p["explanation"],
        "hint": p["hint"],
        "tags": ["password"],
    }
