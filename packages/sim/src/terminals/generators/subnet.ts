import type { McQuestion, NumericField, NumericQuestion } from "../types";
import { base, fill, param, pool, range, type GenContext } from "./common";

/**
 * Sub-redes. Prefixos limitados a /24–/30 (a máscara sempre cai no último octeto),
 * o que mantém a aritmética idêntica no espelho em Python (apps/api/app/terminals/generators/subnet.py).
 */
interface SubnetPool {
  same_network: {
    prompt: string;
    explanation: string;
    hint: string;
    contextTitle: string;
    headers: string[];
    labels: Record<string, string>;
  };
  numeric: {
    prompt: string;
    explanation: string;
    hint: string;
    contextTitle: string;
    headers: string[];
    labels: Record<string, string>;
    fields: Record<string, NumericField>;
  };
}

const DEFAULT_PREFIXES = [24, 25, 26, 27, 28];

export const blockSize = (prefix: number): number => 2 ** (32 - prefix);
export const maskFor = (prefix: number): string => `255.255.255.${256 - blockSize(prefix)}`;

interface Net {
  prefix: number;
  size: number;
  blocks: number;
  third: number;
  start: number;
  mask: string;
}

function netVars(net: Net, ip: string): Record<string, string> {
  const { third, start, size } = net;
  return {
    ip,
    prefix: String(net.prefix),
    mask: net.mask,
    size: String(size),
    network: `192.168.${third}.${start}`,
    broadcast: `192.168.${third}.${start + size - 1}`,
    first: `192.168.${third}.${start + 1}`,
    last: `192.168.${third}.${start + size - 2}`,
    hosts: String(size - 2),
  };
}

function pickNet(ctx: GenContext): Net {
  const prefix = ctx.rng.pick(param<number[]>(ctx, "prefixes", DEFAULT_PREFIXES));
  const size = blockSize(prefix);
  const blocks = 256 / size;
  const third = ctx.rng.int(0, 20);
  const start = ctx.rng.int(0, blocks - 1) * size;
  return { prefix, size, blocks, third, start, mask: maskFor(prefix) };
}

function configTable(title: string, headers: string[], labels: Record<string, string>, vars: Record<string, string>) {
  return {
    type: "table" as const,
    title,
    headers,
    rows: [
      [labels.ip!, vars.ip!],
      [labels.mask!, vars.mask!],
      [labels.prefix!, `/${vars.prefix!}`],
    ],
  };
}

/** Múltipla escolha: qual destino está na mesma sub-rede (não precisa de roteador). */
export function subnetSameNetwork(ctx: GenContext): McQuestion {
  const P = pool<SubnetPool>(ctx, "subnet").same_network;
  const rng = ctx.rng;
  const net = pickNet(ctx);
  const { third, size, start, blocks } = net;

  const hosts = rng.sample(range(start + 1, start + size - 2), 2);
  const ip = `192.168.${third}.${hosts[0]}`;
  const correct = `192.168.${third}.${hosts[1]}`;
  const otherThird = third + rng.int(1, 9);
  const farThird = third + rng.int(10, 19);
  const sameHostOtherNet = `192.168.${otherThird}.${hosts[0]}`;
  const farNet = `192.168.${farThird}.${rng.int(2, 250)}`;
  // com /24 o bloco ocupa o octeto inteiro: o vizinho tem de vir de outra rede
  const neighbour = blocks > 1
    ? `192.168.${third}.${((start / size + rng.int(1, blocks - 1)) % blocks) * size + rng.int(1, size - 2)}`
    : `192.168.${third + rng.int(20, 29)}.${rng.int(2, 250)}`;

  const options = rng.shuffle([correct, sameHostOtherNet, neighbour, farNet]);
  const vars = { ...netVars(net, ip), correct };
  return {
    ...base(ctx, "subnet_same_network"),
    kind: "mc",
    prompt: fill(P.prompt, vars),
    context: [configTable(P.contextTitle, P.headers, P.labels, vars)],
    options,
    answer: options.indexOf(correct),
    explanation: fill(P.explanation, vars),
    hint: fill(P.hint, vars),
    tags: ["subnet"],
  };
}

/** Cálculo numérico: endereço de rede, broadcast, hosts utilizáveis e máscara. */
export function subnetNumeric(ctx: GenContext): NumericQuestion {
  const P = pool<SubnetPool>(ctx, "subnet").numeric;
  const rng = ctx.rng;
  const net = pickNet(ctx);
  const host = rng.int(net.start + 1, net.start + net.size - 2);
  const ip = `192.168.${net.third}.${host}`;
  const vars = netVars(net, ip);
  const wanted = param<string[]>(ctx, "fields", ["network", "broadcast", "hosts"]);
  const fields = wanted.map((name) => {
    const def = P.fields[name];
    if (!def) throw new Error(`unknown subnet field: ${name}`);
    return def;
  });
  return {
    ...base(ctx, "subnet_numeric"),
    kind: "numeric",
    prompt: fill(P.prompt, vars),
    context: [configTable(P.contextTitle, P.headers, P.labels, vars)],
    fields,
    answer: wanted.map((name) => vars[name]!),
    explanation: fill(P.explanation, vars),
    hint: fill(P.hint, vars),
    tags: ["subnet"],
  };
}
