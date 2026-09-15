"""Registro de geradores (espelho de packages/sim/src/terminals/generators/index.ts)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..rng import mulberry32
from .common import GenContext
from .lan import address_format_match, switch_table_match
from .pool import classify_pool, match_pool, mc_pool

Generator = Callable[[GenContext], dict[str, Any]]

GENERATORS: dict[str, Generator] = {
    "mc_pool": mc_pool,
    "match_pool": match_pool,
    "classify_pool": classify_pool,
    "address_format_match": address_format_match,
    "switch_table_match": switch_table_match,
}


def generate_question(generator: str, params: dict[str, Any] | None, seed: int, pools: dict[str, Any]) -> dict[str, Any]:
    g = GENERATORS.get(generator)
    if g is None:
        raise ValueError(f"unknown generator: {generator}")
    return g(GenContext(rng=mulberry32(seed), seed=seed, params=params or {}, pools=pools))


__all__ = ["GENERATORS", "GenContext", "generate_question"]
