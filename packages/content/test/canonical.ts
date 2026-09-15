import { createHash } from "node:crypto";
import type { Question } from "@fireshot/sim";

/**
 * JSON canônico: chaves ordenadas, sem espaços, sem `undefined`.
 * O servidor usa json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False): mesma saída para o conteúdo do jogo.
 */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** Resposta canônica de uma questão (o gabarito no formato que o cliente envia). */
export function canonicalAnswer(q: Question): unknown {
  switch (q.kind) {
    case "mc": return q.answer;
    case "match":
    case "classify": return q.answer;
    case "numeric": return q.answer;
    case "rules": return { defaultPolicy: "deny", rules: q.answer.allowed.map((port) => ({ port, action: "allow" })) };
  }
}

/** Respostas variadas (certa, errada, malformada) para comparar a correção entre TS e Python. */
export function sampleAnswers(q: Question): unknown[] {
  const out: unknown[] = [canonicalAnswer(q), null, "x", [], { defaultPolicy: "allow" }];
  switch (q.kind) {
    case "mc":
      out.push((q.answer + 1) % q.options.length, q.answer + 0.5, true);
      break;
    case "match":
    case "classify": {
      const n = q.kind === "match" ? q.right.length : q.categories.length;
      out.push(q.answer.map((x) => (x + 1) % n), [...q.answer.slice(1), q.answer[0]], q.answer.map((x, i) => (i === 0 ? true : x)));
      break;
    }
    case "numeric":
      out.push(q.answer.map((x) => ` ${x.toUpperCase()} `), q.answer.map(() => "0"), q.answer.map((x) => x.replace(/\b(\d)\b/g, "00$1")));
      break;
    case "rules": {
      const ports = q.ports.map((p) => p.port);
      out.push(
        { defaultPolicy: "allow", rules: ports.filter((p) => !q.answer.allowed.includes(p)).map((port) => ({ port, action: "deny" })) },
        { defaultPolicy: "allow", rules: [] },
        { defaultPolicy: "deny", rules: [{ port: "80", action: "allow" }] },
      );
      break;
    }
  }
  return out;
}
