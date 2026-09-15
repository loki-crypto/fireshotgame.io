import type { Rng } from "../../core/rng";
import type { Question } from "../types";

export interface GenContext {
  rng: Rng;
  seed: number;
  params: Record<string, unknown>;
  pools: Record<string, unknown>;
}

export type Generator = (ctx: GenContext) => Question;

/** Substitui {chave} por valores (chaves ausentes permanecem). */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

export const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");

export function randomMac(rng: Rng): string {
  const bytes = [rng.int(0, 127) * 2];
  for (let i = 0; i < 5; i++) bytes.push(rng.int(0, 255));
  return bytes.map(hex2).join(":");
}

export function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

export function pool<T = Record<string, unknown>>(ctx: GenContext, name: string): T {
  const p = ctx.pools[name];
  if (!p || typeof p !== "object") throw new Error(`pool not found: ${name}`);
  return p as T;
}

export function param<T>(ctx: GenContext, key: string, fallback: T): T {
  const v = ctx.params[key];
  return v === undefined || v === null ? fallback : (v as T);
}

/**
 * Valores especiais em variáveis de template:
 *  "$ipv4_private" → IP privado aleatório; "$mac" → MAC; "$int:a:b" → inteiro.
 * Qualquer outro valor é usado literalmente.
 */
export function resolveVar(rng: Rng, spec: string): string {
  if (spec === "$ipv4_private") return `192.168.${rng.int(0, 30)}.${rng.int(2, 254)}`;
  if (spec === "$mac") return randomMac(rng);
  if (spec.startsWith("$int:")) {
    const [, a, b] = spec.split(":");
    return String(rng.int(Number(a), Number(b)));
  }
  return spec;
}

/** Escolhe um valor para cada variável (chaves em ordem alfabética, para determinismo entre linguagens). */
export function pickVars(rng: Rng, vars: Record<string, string[]> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!vars) return out;
  for (const key of Object.keys(vars).sort()) {
    out[key] = resolveVar(rng, rng.pick(vars[key]!));
  }
  return out;
}

export function base(ctx: GenContext, generator: string): Pick<Question, "generator" | "seed" | "context" | "tags"> {
  return { generator, seed: ctx.seed >>> 0, context: [], tags: [] };
}
