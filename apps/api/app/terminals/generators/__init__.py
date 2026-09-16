"""Registro de geradores (espelho de packages/sim/src/terminals/generators/index.ts)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..rng import mulberry32
from .common import GenContext
from .firewall import firewall_rules, port_service_match
from .lan import address_format_match, switch_table_match
from .passwords import password_strength
from .pool import classify_pool, match_pool, mc_pool
from .subnet import subnet_numeric, subnet_same_network

Generator = Callable[[GenContext], dict[str, Any]]

GENERATORS: dict[str, Generator] = {
    "mc_pool": mc_pool,
    "match_pool": match_pool,
    "classify_pool": classify_pool,
    "address_format_match": address_format_match,
    "switch_table_match": switch_table_match,
    "subnet_same_network": subnet_same_network,
    "subnet_numeric": subnet_numeric,
    "port_service_match": port_service_match,
    "firewall_rules": firewall_rules,
    "password_strength": password_strength,
}


def generate_question(generator: str, params: dict[str, Any] | None, seed: int, pools: dict[str, Any]) -> dict[str, Any]:
    g = GENERATORS.get(generator)
    if g is None:
        raise ValueError(f"unknown generator: {generator}")
    return g(GenContext(rng=mulberry32(seed), seed=seed, params=params or {}, pools=pools))


__all__ = ["GENERATORS", "GenContext", "generate_question"]
