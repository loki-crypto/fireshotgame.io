import type { MatchQuestion } from "../types";
import { base, param, pool, randomMac, range, type GenContext } from "./common";

interface LanPool {
  address_format: {
    prompt: string;
    types: Record<string, string>;
    domains: string[];
    ports: number[];
    explanation: string;
    hint: string;
  };
  switch_table: {
    prompt: string;
    devices: string[];
    inventoryTitle: string;
    arpTitle: string;
    camTitle: string;
    headers: { inventory: string[]; arp: string[]; cam: string[] };
    portLabel: string;
    explanation: string;
    hint: string;
  };
}

/** Associação valor ↔ tipo de identificador (IPv4, MAC, porta, domínio, IPv6). */
export function addressFormatMatch(ctx: GenContext): MatchQuestion {
  const P = pool<LanPool>(ctx, "lan").address_format;
  const rng = ctx.rng;
  const types = param<string[]>(ctx, "types", ["ipv4", "mac", "port", "domain"]);
  const values = types.map((t) => {
    switch (t) {
      case "ipv4": return `192.168.${rng.int(0, 20)}.${rng.int(2, 254)}`;
      case "mac": return randomMac(rng);
      case "port": return String(rng.pick(P.ports));
      case "domain": return rng.pick(P.domains);
      case "ipv6": return `fe80::${rng.int(0, 65535).toString(16)}:${rng.int(0, 65535).toString(16)}`;
      default: throw new Error(`unknown address type ${t}`);
    }
  });
  const idx = types.map((_, i) => i);
  const leftOrder = rng.shuffle(idx);
  const rightOrder = rng.shuffle(idx);
  return {
    ...base(ctx, "address_format_match"),
    kind: "match",
    prompt: P.prompt,
    left: leftOrder.map((i) => values[i]!),
    right: rightOrder.map((i) => P.types[types[i]!]!),
    answer: leftOrder.map((i) => rightOrder.indexOf(i)),
    explanation: P.explanation,
    hint: P.hint,
  };
}

/** Localizar a porta do switch de cada dispositivo cruzando inventário (nome→IP), ARP (IP→MAC) e tabela MAC (porta→MAC). */
export function switchTableMatch(ctx: GenContext): MatchQuestion {
  const P = pool<LanPool>(ctx, "lan").switch_table;
  const rng = ctx.rng;
  const count = param(ctx, "count", 4);
  const octet = rng.int(1, 30);
  const names = rng.sample(P.devices, count);
  const hosts = rng.sample(range(2, 200), count);
  const macs = names.map(() => randomMac(rng));
  const ports = rng.sample(range(1, 8), count);
  const ips = hosts.map((h) => `192.168.${octet}.${h}`);
  const idx = names.map((_, i) => i);
  const arpOrder = rng.shuffle(idx);
  const camOrder = rng.shuffle(idx);
  const sortedPorts = ports.slice().sort((a, b) => a - b);
  const label = (n: number): string => P.portLabel.replace("{n}", String(n));
  return {
    ...base(ctx, "switch_table_match"),
    kind: "match",
    prompt: P.prompt,
    context: [
      { type: "table", title: P.inventoryTitle, headers: P.headers.inventory, rows: idx.map((i) => [names[i]!, ips[i]!]) },
      { type: "table", title: P.arpTitle, headers: P.headers.arp, rows: arpOrder.map((i) => [ips[i]!, macs[i]!]) },
      { type: "table", title: P.camTitle, headers: P.headers.cam, rows: camOrder.map((i) => [label(ports[i]!), macs[i]!]) },
    ],
    left: idx.map((i) => names[i]!),
    right: sortedPorts.map(label),
    answer: idx.map((i) => sortedPorts.indexOf(ports[i]!)),
    explanation: P.explanation,
    hint: P.hint,
  };
}
