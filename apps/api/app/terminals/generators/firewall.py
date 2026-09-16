"""Portas e regras de firewall — espelho de packages/sim/src/terminals/generators/firewall.ts."""

from __future__ import annotations

from typing import Any

from .common import GenContext, base, fill, param, pool


def port_service_match(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, "ports")
    rng = ctx.rng
    services: list[dict[str, Any]] = p["services"]
    count = min(param(ctx, "count", 5), len(services))
    chosen = rng.sample(services, count)
    idx = list(range(len(chosen)))
    right_order = rng.shuffle(idx)
    return {
        **base(ctx, "port_service_match"),
        "kind": "match",
        "prompt": p["match"]["prompt"],
        "left": [str(s["port"]) for s in chosen],
        "right": [chosen[i]["name"] for i in right_order],
        "answer": [right_order.index(i) for i in idx],
        "explanation": p["match"]["explanation"],
        "hint": p["match"]["hint"],
        "tags": ["ports"],
    }


def _names(items: list[dict[str, Any]]) -> str:
    if not items:
        return "—"
    return ", ".join(f"{s['name']} ({s['port']})" for s in items)


def firewall_rules(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, "ports")
    rules = p["rules"]
    rng = ctx.rng
    policy = rng.pick(rules["policies"])
    total = param(ctx, "count", 5)

    allow_keys: list[str] = policy["allow"]
    required = [s for s in p["services"] if s["key"] in allow_keys]
    rest = [s for s in p["services"] if s["key"] not in allow_keys]
    extra = max(1, min(total - len(required), len(rest)))
    ports = rng.shuffle([*required, *rng.sample(rest, extra)])

    allowed = [s for s in ports if s["key"] in allow_keys]
    denied = [s for s in ports if s["key"] not in allow_keys]
    variables = {
        "policy": f"Este host {policy['text']}",
        "allowNames": _names(allowed),
        "denyNames": _names(denied),
    }
    return {
        **base(ctx, "firewall_rules"),
        "kind": "rules",
        "prompt": fill(rules["prompt"], variables),
        # sem tabela de contexto: a grade de regras da UI já lista porta, serviço e descrição
        "ports": [{"port": s["port"], "service": s["name"], "description": s["description"]} for s in ports],
        "answer": {"allowed": [s["port"] for s in allowed]},
        "explanation": fill(rules["explanation"], variables),
        "hint": rules["hint"],
        "tags": ["firewall"],
    }
