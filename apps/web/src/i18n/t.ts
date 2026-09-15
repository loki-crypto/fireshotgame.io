import ptBR from "./pt-BR.json";

type Dict = { [k: string]: string | Dict };

const dictionaries: Record<string, Dict> = { "pt-BR": ptBR as Dict };
let current: Dict = dictionaries["pt-BR"]!;

export function setLocale(locale: string): void {
  const d = dictionaries[locale];
  if (d) current = d;
}

export function lookup(key: string, dict: Dict = current): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Traduz uma chave com interpolação `{nome}`. Chaves ausentes retornam a própria chave. */
export function t(key: string, params?: Record<string, string | number>): string {
  const v = lookup(key);
  if (v === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] chave ausente: ${key}`);
    return key;
  }
  if (!params) return v;
  return v.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
