import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ptBR from "../src/i18n/pt-BR.json";
import { lookup, t, formatHours, formatTime } from "../src/i18n/t";
import { ACTIONS } from "../src/app/settings";

type Dict = { [k: string]: string | Dict };
const dict = ptBR as Dict;

function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, exts);
    return exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

const root = resolve(__dirname, "..");
const sources = [
  ...walk(join(root, "src"), [".ts", ".tsx"]),
  ...walk(resolve(root, "../../packages/sim/src"), [".ts"]),
].map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

describe("i18n pt-BR", () => {
  it("toda chave literal usada em t(\"…\") existe no dicionário", () => {
    const missing: string[] = [];
    for (const { path, text } of sources) {
      for (const m of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
        if (lookup(m[1]!, dict) === undefined) missing.push(`${m[1]} (${path.replace(root, "")})`);
      }
      for (const m of text.matchAll(/key:\s*"(objective\.[a-zA-Z]+)"/g)) {
        if (lookup(m[1]!, dict) === undefined) missing.push(`${m[1]} (${path})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("chaves dinâmicas conhecidas existem", () => {
    const dynamic = [
      ...ACTIONS.map((a) => `settings.action.${a}`),
      ...["phaseComplete", "noDeath", "parTime", "kills", "terminals", "bytes", "firstCompletion"].map((k) => `rewards.${k}`),
      ...["phases", "accuracy", "activeTime"].map((k) => `certificate.req.${k}`),
      ...["map", "rank", "shop", "badges", "profile", "certificate", "settings"].map((k) => `hub.${k}`),
      ...["phases", "upgrades", "badges", "slots"].map((k) => `hub.unlock.${k}`),
      ...["empty", "invalid", "checking", "available", "taken", "unknown"].map((k) => `auth.usernameState.${k}`),
      ...["global", "phase"].map((k) => `rank.${k}`),
      ...["offense", "defense", "analysis"].map((k) => `shop.branch.${k}`),
      ...["allow", "deny"].map((k) => `terminal.${k}`),
    ];
    expect(dynamic.filter((k) => lookup(k, dict) === undefined)).toEqual([]);
  });

  it("todo código de erro da API tem mensagem", () => {
    const authCodes = ["invalid_credentials", "email_taken", "username_taken", "invalid_username", "terms_required", "weak_password", "common_password", "too_many_attempts", "rate_limited", "validation"];
    const codes = ["session_expired", "not_found", "forbidden", "phase_locked", "insufficient_bytes", "requirements_not_met", "no_slots", "not_eligible", "already_issued", "payload_too_large", "network", "unknown"];
    expect(authCodes.filter((c) => lookup(`auth.errors.${c}`, dict) === undefined)).toEqual([]);
    expect(codes.filter((c) => lookup(`errors.${c}`, dict) === undefined)).toEqual([]);
  });

  it("nenhum valor vazio e interpolação consistente", () => {
    const bad: string[] = [];
    const visit = (node: Dict, prefix: string): void => {
      for (const [k, v] of Object.entries(node)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "string") {
          if (v.trim() === "") bad.push(`${key}: vazio`);
          if ((v.match(/\{/g) ?? []).length !== (v.match(/\}/g) ?? []).length) bad.push(`${key}: chaves desbalanceadas`);
        } else visit(v, key);
      }
    };
    visit(dict, "");
    expect(bad).toEqual([]);
  });

  it("t interpola parâmetros e devolve a chave quando ausente", () => {
    expect(t("hub.level", { level: 3 })).toBe("Nível 3");
    expect(t("nao.existe")).toBe("nao.existe");
    expect(t("hub.nextLevel", { current: 10 })).toContain("{needed}");
  });

  it("formata tempo e horas", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(125.9)).toBe("02:05");
    expect(formatHours(59)).toBe("0 min");
    expect(formatHours(3 * 3600 + 5 * 60)).toBe("3 h 05 min");
  });
});
