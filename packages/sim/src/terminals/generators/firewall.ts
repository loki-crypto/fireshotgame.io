import type { MatchQuestion, RulesQuestion } from "../types";
import { base, fill, param, pool, type GenContext } from "./common";

interface ServiceDef {
  key: string;
  port: number;
  name: string;
  description: string;
}

interface PolicyDef {
  id: string;
  text: string;
  allow: string[];
}

interface PortsPool {
  services: ServiceDef[];
  match: { prompt: string; explanation: string; hint: string };
  rules: {
    prompt: string;
    explanation: string;
    hint: string;
    policies: PolicyDef[];
  };
}

/** Associação porta ↔ serviço. */
export function portServiceMatch(ctx: GenContext): MatchQuestion {
  const p = pool<PortsPool>(ctx, "ports");
  const rng = ctx.rng;
  const count = Math.min(param(ctx, "count", 5), p.services.length);
  const chosen = rng.sample(p.services, count);
  const idx = chosen.map((_, i) => i);
  const rightOrder = rng.shuffle(idx);
  return {
    ...base(ctx, "port_service_match"),
    kind: "match",
    prompt: p.match.prompt,
    left: chosen.map((s) => String(s.port)),
    right: rightOrder.map((i) => chosen[i]!.name),
    answer: idx.map((i) => rightOrder.indexOf(i)),
    explanation: p.match.explanation,
    hint: p.match.hint,
    tags: ["ports"],
  };
}

/**
 * Escrita de regras de firewall a partir de uma política em linguagem natural.
 * Todos os serviços exigidos pela política entram na lista; o resto vem sorteado.
 */
export function firewallRules(ctx: GenContext): RulesQuestion {
  const p = pool<PortsPool>(ctx, "ports");
  const P = p.rules;
  const rng = ctx.rng;
  const policy = rng.pick(P.policies);
  const total = param(ctx, "count", 5);

  const required = p.services.filter((s) => policy.allow.includes(s.key));
  const rest = p.services.filter((s) => !policy.allow.includes(s.key));
  const extra = Math.max(1, Math.min(total - required.length, rest.length));
  const ports = rng.shuffle([...required, ...rng.sample(rest, extra)]);

  const allowed = ports.filter((s) => policy.allow.includes(s.key));
  const denied = ports.filter((s) => !policy.allow.includes(s.key));
  const names = (list: ServiceDef[]): string =>
    list.length === 0 ? "—" : list.map((s) => `${s.name} (${s.port})`).join(", ");
  const vars = { policy: `Este host ${policy.text}`, allowNames: names(allowed), denyNames: names(denied) };

  return {
    ...base(ctx, "firewall_rules"),
    kind: "rules",
    prompt: fill(P.prompt, vars),
    // sem tabela de contexto: a própria grade de regras da UI já lista porta, serviço e descrição
    ports: ports.map((s) => ({ port: s.port, service: s.name, description: s.description })),
    answer: { allowed: allowed.map((s) => s.port) },
    explanation: fill(P.explanation, vars),
    hint: P.hint,
    tags: ["firewall"],
  };
}
