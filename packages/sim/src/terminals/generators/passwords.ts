import type { Rng } from "../../core/rng";
import type { ClassifyItem, ClassifyQuestion } from "../types";
import { base, fill, param, pool, type GenContext } from "./common";

interface Recipe {
  id: string;
  explanation: string;
  details: string[];
}

interface PasswordPool {
  strength: {
    prompt: string;
    categories: string[];
    explanation: string;
    hint: string;
    lowercase: string;
    symbols: string;
    randomAlphabet: string;
    words: string[];
    names: string[];
    sequences: string[];
    passphraseWords: string[];
    detailTemplates: Record<string, string>;
    weakRecipes: Recipe[];
    strongRecipes: Recipe[];
  };
}

type Strength = PasswordPool["strength"];

const LEET: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5" };
const DIGIT_SUFFIXES = ["123", "1234", "12345", "2024"];

const isLower = (c: string): boolean => c >= "a" && c <= "z";
const isUpper = (c: string): boolean => c >= "A" && c <= "Z";
const isDigit = (c: string): boolean => c >= "0" && c <= "9";

/** Quantos dos 4 tipos de caractere (minúscula, maiúscula, dígito, símbolo) aparecem. */
export function charClasses(s: string): number {
  let lower = false, upper = false, digit = false, symbol = false;
  for (const c of s) {
    if (isLower(c)) lower = true;
    else if (isUpper(c)) upper = true;
    else if (isDigit(c)) digit = true;
    else symbol = true;
  }
  return [lower, upper, digit, symbol].filter(Boolean).length;
}

const leet = (w: string): string => [...w].map((c) => LEET[c] ?? c).join("");
const capitalize = (w: string): string => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1));
const chars = (rng: Rng, alphabet: string, n: number): string => {
  const list = [...alphabet];
  let out = "";
  for (let i = 0; i < n; i++) out += rng.pick(list);
  return out;
};

function buildPassword(rng: Rng, P: Strength, id: string): string {
  switch (id) {
    case "word-year": return rng.pick(P.words) + String(rng.int(1990, 2026));
    case "name-digits": return rng.pick(P.names) + rng.pick(DIGIT_SUFFIXES);
    case "sequence": return rng.pick(P.sequences);
    case "short-random": return chars(rng, P.lowercase, 6);
    case "leet-word": return leet(capitalize(rng.pick(P.words))) + rng.pick([...P.symbols]);
    case "passphrase": return `${rng.sample(P.passphraseWords, 4).join("-")}-${rng.int(10, 99)}`;
    case "random-long": return chars(rng, P.randomAlphabet, 16);
    case "mixed":
      return `${capitalize(rng.pick(P.passphraseWords))}_${rng.pick(P.passphraseWords)}#${rng.int(100, 999)}${rng.pick([...P.symbols])}`;
    default: throw new Error(`unknown password recipe: ${id}`);
  }
}

function makeItem(rng: Rng, P: Strength, recipe: Recipe): { item: ClassifyItem; explanation: string } {
  const password = buildPassword(rng, P, recipe.id);
  const vars = { len: String(password.length), classes: String(charClasses(password)) };
  return {
    item: {
      text: password,
      detail: recipe.details.map((key) => fill(P.detailTemplates[key] ?? key, vars)),
    },
    explanation: recipe.explanation,
  };
}

/** Classificação de senhas geradas em fracas × fortes (o texto de cada senha é sorteado por receita). */
export function passwordStrength(ctx: GenContext): ClassifyQuestion {
  const P = pool<PasswordPool>(ctx, "passwords").strength;
  const rng = ctx.rng;
  const count = param(ctx, "count", 4);
  const nWeak = Math.min(Math.ceil(count / 2), P.weakRecipes.length);
  const nStrong = Math.min(count - nWeak, P.strongRecipes.length);

  const built = [
    ...rng.sample(P.weakRecipes, nWeak).map((r) => ({ ...makeItem(rng, P, r), category: 0 })),
    ...rng.sample(P.strongRecipes, nStrong).map((r) => ({ ...makeItem(rng, P, r), category: 1 })),
  ];
  const order = rng.shuffle(built.map((_, i) => i));
  const chosen = order.map((i) => built[i]!);

  return {
    ...base(ctx, "password_strength"),
    kind: "classify",
    prompt: P.prompt,
    categories: P.categories,
    items: chosen.map((c) => c.item),
    answer: chosen.map((c) => c.category),
    itemExplanations: chosen.map((c) => c.explanation),
    explanation: P.explanation,
    hint: P.hint,
    tags: ["password"],
  };
}
