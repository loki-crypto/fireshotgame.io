"""Geradores da rede local — espelho de generators/lan.ts."""

from __future__ import annotations

from typing import Any

from .common import GenContext, base, int_range, param, pool, random_mac


def address_format_match(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, "lan")["address_format"]
    rng = ctx.rng
    types: list[str] = param(ctx, "types", ["ipv4", "mac", "port", "domain"])
    values: list[str] = []
    for t in types:
        if t == "ipv4":
            values.append(f"192.168.{rng.int(0, 20)}.{rng.int(2, 254)}")
        elif t == "mac":
            values.append(random_mac(rng))
        elif t == "port":
            values.append(str(rng.pick(p["ports"])))
        elif t == "domain":
            values.append(rng.pick(p["domains"]))
        elif t == "ipv6":
            values.append(f"fe80::{format(rng.int(0, 65535), 'x')}:{format(rng.int(0, 65535), 'x')}")
        else:
            raise ValueError(f"unknown address type {t}")
    idx = list(range(len(types)))
    left_order = rng.shuffle(idx)
    right_order = rng.shuffle(idx)
    return {
        **base(ctx, "address_format_match"),
        "kind": "match",
        "prompt": p["prompt"],
        "left": [values[i] for i in left_order],
        "right": [p["types"][types[i]] for i in right_order],
        "answer": [right_order.index(i) for i in left_order],
        "explanation": p["explanation"],
        "hint": p["hint"],
    }


def switch_table_match(ctx: GenContext) -> dict[str, Any]:
    p = pool(ctx, "lan")["switch_table"]
    rng = ctx.rng
    count = param(ctx, "count", 4)
    octet = rng.int(1, 30)
    names = rng.sample(p["devices"], count)
    hosts = rng.sample(int_range(2, 200), count)
    macs = [random_mac(rng) for _ in names]
    ports = rng.sample(int_range(1, 8), count)
    ips = [f"192.168.{octet}.{h}" for h in hosts]
    idx = list(range(len(names)))
    arp_order = rng.shuffle(idx)
    cam_order = rng.shuffle(idx)
    sorted_ports = sorted(ports)
    headers = p["headers"]

    def label(n: int) -> str:
        return p["portLabel"].replace("{n}", str(n), 1)

    return {
        **base(ctx, "switch_table_match"),
        "kind": "match",
        "prompt": p["prompt"],
        "context": [
            {"type": "table", "title": p["inventoryTitle"], "headers": headers["inventory"], "rows": [[names[i], ips[i]] for i in idx]},
            {"type": "table", "title": p["arpTitle"], "headers": headers["arp"], "rows": [[ips[i], macs[i]] for i in arp_order]},
            {"type": "table", "title": p["camTitle"], "headers": headers["cam"], "rows": [[label(ports[i]), macs[i]] for i in cam_order]},
        ],
        "left": [names[i] for i in idx],
        "right": [label(n) for n in sorted_ports],
        "answer": [sorted_ports.index(ports[i]) for i in idx],
        "explanation": p["explanation"],
        "hint": p["hint"],
    }
