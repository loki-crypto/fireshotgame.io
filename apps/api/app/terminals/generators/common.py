"""Utilidades compartilhadas dos geradores — espelho de packages/sim/src/terminals/generators/common.ts."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ..rng import Rng

_VAR = re.compile(r"\{([A-Za-z0-9_]+)\}")  # \w do JavaScript (sem flag u)


@dataclass
class GenContext:
    rng: Rng
    seed: int
    params: dict[str, Any] = field(default_factory=dict)
    pools: dict[str, Any] = field(default_factory=dict)


def fill(template: str, variables: dict[str, str]) -> str:
    return _VAR.sub(lambda m: variables[m.group(1)] if m.group(1) in variables else m.group(0), template)


def hex2(n: int) -> str:
    return format(n & 0xFF, "02X")


def random_mac(rng: Rng) -> str:
    parts = [rng.int(0, 127) * 2]
    for _ in range(5):
        parts.append(rng.int(0, 255))
    return ":".join(hex2(b) for b in parts)


def int_range(a: int, b: int) -> list[int]:
    return list(range(a, b + 1))


def pool(ctx: GenContext, name: str) -> dict[str, Any]:
    p = ctx.pools.get(name)
    if not isinstance(p, dict):
        raise ValueError(f"pool not found: {name}")
    return p


def param[T](ctx: GenContext, key: str, fallback: T) -> T:
    v = ctx.params.get(key)
    return fallback if v is None else v


def resolve_var(rng: Rng, spec: str) -> str:
    if spec == "$ipv4_private":
        return f"192.168.{rng.int(0, 30)}.{rng.int(2, 254)}"
    if spec == "$mac":
        return random_mac(rng)
    if spec.startswith("$int:"):
        _, a, b = spec.split(":")
        return str(rng.int(int(a), int(b)))
    return spec


def pick_vars(rng: Rng, variables: dict[str, list[str]] | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not variables:
        return out
    for key in sorted(variables):
        out[key] = resolve_var(rng, rng.pick(variables[key]))
    return out


def base(ctx: GenContext, generator: str) -> dict[str, Any]:
    return {"generator": generator, "seed": ctx.seed & 0xFFFFFFFF, "context": [], "tags": []}


def filter_tagged(items: list[dict[str, Any]], tags: list[str] | None, ids: list[str] | None) -> list[dict[str, Any]]:
    out = items
    if ids is not None:
        out = [x for x in out if x.get("id") is not None and x["id"] in ids]
    if tags is not None:
        out = [x for x in out if any(t in tags for t in x.get("tags", []))]
    if not out:
        raise ValueError("pool filter produced no items")
    return out
