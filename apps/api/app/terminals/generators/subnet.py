"""Sub-redes — espelho de packages/sim/src/terminals/generators/subnet.ts."""

from __future__ import annotations

from typing import Any

from .common import GenContext, base, fill, int_range, param, pool

DEFAULT_PREFIXES = [24, 25, 26, 27, 28]


def block_size(prefix: int) -> int:
    return 2 ** (32 - prefix)


def mask_for(prefix: int) -> str:
    return f"255.255.255.{256 - block_size(prefix)}"


def _net_vars(net: dict[str, Any], ip: str) -> dict[str, str]:
    third = net["third"]
    start = net["start"]
    size = net["size"]
    return {
        "ip": ip,
        "prefix": str(net["prefix"]),
        "mask": net["mask"],
        "size": str(size),
        "network": f"192.168.{third}.{start}",
        "broadcast": f"192.168.{third}.{start + size - 1}",
        "first": f"192.168.{third}.{start + 1}",
        "last": f"192.168.{third}.{start + size - 2}",
        "hosts": str(size - 2),
    }


def _pick_net(ctx: GenContext) -> dict[str, Any]:
    prefix = ctx.rng.pick(param(ctx, "prefixes", DEFAULT_PREFIXES))
    size = block_size(prefix)
    blocks = 256 // size
    third = ctx.rng.int(0, 20)
    start = ctx.rng.int(0, blocks - 1) * size
    return {"prefix": prefix, "size": size, "blocks": blocks, "third": third, "start": start, "mask": mask_for(prefix)}


def _config_table(title: str, headers: list[str], labels: dict[str, str], variables: dict[str, str]) -> dict[str, Any]:
    return {
        "type": "table",
        "title": title,
        "headers": headers,
        "rows": [
            [labels["ip"], variables["ip"]],
            [labels["mask"], variables["mask"]],
            [labels["prefix"], f"/{variables['prefix']}"],
        ],
    }


def subnet_same_network(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, "subnet")["same_network"]
    rng = ctx.rng
    net = _pick_net(ctx)
    third, size, start, blocks = net["third"], net["size"], net["start"], net["blocks"]

    hosts = rng.sample(int_range(start + 1, start + size - 2), 2)
    ip = f"192.168.{third}.{hosts[0]}"
    correct = f"192.168.{third}.{hosts[1]}"
    other_third = third + rng.int(1, 9)
    far_third = third + rng.int(10, 19)
    same_host_other_net = f"192.168.{other_third}.{hosts[0]}"
    far_net = f"192.168.{far_third}.{rng.int(2, 250)}"
    if blocks > 1:
        block_index = (start // size + rng.int(1, blocks - 1)) % blocks
        neighbour = f"192.168.{third}.{block_index * size + rng.int(1, size - 2)}"
    else:
        neighbour = f"192.168.{third + rng.int(20, 29)}.{rng.int(2, 250)}"

    options = rng.shuffle([correct, same_host_other_net, neighbour, far_net])
    variables = {**_net_vars(net, ip), "correct": correct}
    return {
        **base(ctx, "subnet_same_network"),
        "kind": "mc",
        "prompt": fill(p["prompt"], variables),
        "context": [_config_table(p["contextTitle"], p["headers"], p["labels"], variables)],
        "options": options,
        "answer": options.index(correct),
        "explanation": fill(p["explanation"], variables),
        "hint": fill(p["hint"], variables),
        "tags": ["subnet"],
    }


def subnet_numeric(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, "subnet")["numeric"]
    rng = ctx.rng
    net = _pick_net(ctx)
    host = rng.int(net["start"] + 1, net["start"] + net["size"] - 2)
    ip = f"192.168.{net['third']}.{host}"
    variables = _net_vars(net, ip)
    wanted: list[str] = param(ctx, "fields", ["network", "broadcast", "hosts"])
    fields = []
    for name in wanted:
        definition = p["fields"].get(name)
        if definition is None:
            raise ValueError(f"unknown subnet field: {name}")
        fields.append(definition)
    return {
        **base(ctx, "subnet_numeric"),
        "kind": "numeric",
        "prompt": fill(p["prompt"], variables),
        "context": [_config_table(p["contextTitle"], p["headers"], p["labels"], variables)],
        "fields": fields,
        "answer": [variables[name] for name in wanted],
        "explanation": fill(p["explanation"], variables),
        "hint": fill(p["hint"], variables),
        "tags": ["subnet"],
    }
