import type { AnswerValue, CheckResult, Question, RulesAnswer } from "./types";

/** Normaliza um IPv4 digitado ("192.168.001.010 " → "192.168.1.10"); retorna null se inválido. */
export function normalizeIpv4(s: string): string | null {
  const parts = s.trim().split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    nums.push(n);
  }
  return nums.join(".");
}

export function normalizeInt(s: string): string | null {
  const t = s.trim().replace(/^\+/, "");
  if (!/^\d{1,10}$/.test(t)) return null;
  return String(Number(t));
}

export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

const isIntArray = (a: unknown): a is number[] => Array.isArray(a) && a.every((x) => Number.isInteger(x));

/** Portas liberadas por um conjunto de regras, avaliado apenas sobre as portas do cenário. */
export function effectiveAllowed(ports: readonly number[], rules: RulesAnswer): number[] {
  return ports.filter((port) => {
    const r = rules.rules.find((x) => x.port === port);
    return r ? r.action === "allow" : rules.defaultPolicy === "allow";
  });
}

export function checkAnswer(q: Question, a: AnswerValue | unknown): CheckResult {
  switch (q.kind) {
    case "mc":
      return { correct: Number.isInteger(a) && a === q.answer, items: [] };
    case "match":
    case "classify": {
      const n = q.answer.length;
      if (!isIntArray(a) || a.length !== n) return { correct: false, items: new Array<boolean>(n).fill(false) };
      const items = q.answer.map((v, i) => a[i] === v);
      return { correct: items.every(Boolean), items };
    }
    case "numeric": {
      const n = q.answer.length;
      if (!Array.isArray(a) || a.length !== n || !a.every((x) => typeof x === "string")) return { correct: false, items: new Array<boolean>(n).fill(false) };
      const items = q.fields.map((f, i) => {
        const given = a[i] as string;
        const expected = q.answer[i]!;
        if (f.format === "ipv4") return normalizeIpv4(given) === expected;
        if (f.format === "int") return normalizeInt(given) === expected;
        return normalizeText(given) === normalizeText(expected);
      });
      return { correct: items.every(Boolean), items };
    }
    case "rules": {
      const ports = q.ports.map((p) => p.port);
      const valid = !!a && typeof a === "object" && !Array.isArray(a)
        && ((a as RulesAnswer).defaultPolicy === "allow" || (a as RulesAnswer).defaultPolicy === "deny")
        && Array.isArray((a as RulesAnswer).rules)
        && (a as RulesAnswer).rules.every((r) => r && Number.isInteger(r.port) && (r.action === "allow" || r.action === "deny"));
      if (!valid) return { correct: false, items: ports.map(() => false) };
      const allowed = new Set(effectiveAllowed(ports, a as RulesAnswer));
      const expected = new Set(q.answer.allowed);
      const items = ports.map((p) => allowed.has(p) === expected.has(p));
      return { correct: items.every(Boolean), items };
    }
  }
}

/** Gabarito no formato em que o cliente envia a resposta (ganchos de teste e fixtures). */
export function canonicalAnswer(q: Question): AnswerValue {
  switch (q.kind) {
    case "mc":
      return q.answer;
    case "match":
    case "classify":
    case "numeric":
      return q.answer;
    case "rules":
      return { defaultPolicy: "deny", rules: q.answer.allowed.map((port) => ({ port, action: "allow" as const })) };
  }
}
