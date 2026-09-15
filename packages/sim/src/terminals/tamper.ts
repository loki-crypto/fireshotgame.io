import type { Rng } from "../core/rng";
import type { AnswerValue, Question } from "./types";

export interface Tampered {
  /** questão como aparece para o jogador (adulterada) */
  display: Question;
  /** transforma a resposta dada sobre a exibição na resposta que chega ao servidor */
  transit(answer: AnswerValue): AnswerValue;
  /** descrição do que foi alterado (mostrada na explicação) */
  change: string;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Simula a interceptação de um MITM: altera o que é exibido (opções trocadas, endereços modificados)
 * ou a resposta em trânsito. O jogo sinaliza a anomalia na interface (certificado que não confere).
 */
export function tamperQuestion(q: Question, rng: Rng): Tampered {
  const d = clone(q);
  switch (d.kind) {
    case "mc": {
      const wrong = d.options.map((_, i) => i).filter((i) => i !== d.answer);
      const j = rng.pick(wrong);
      const tmp = d.options[d.answer]!;
      d.options[d.answer] = d.options[j]!;
      d.options[j] = tmp;
      return { display: d, transit: (a) => a, change: "O MITM trocou o texto de duas alternativas na tela." };
    }
    case "match": {
      if (d.right.length >= 2) {
        const [i, j] = rng.sample(d.right.map((_, k) => k), 2) as [number, number];
        const tmp = d.right[i]!;
        d.right[i] = d.right[j]!;
        d.right[j] = tmp;
      }
      return { display: d, transit: (a) => a, change: "O MITM trocou dois rótulos da coluna da direita." };
    }
    case "numeric": {
      const ipRe = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/;
      const m = d.prompt.match(ipRe);
      if (m) {
        const last = (Number(m[4]) + rng.int(7, 60)) % 254 + 1;
        d.prompt = d.prompt.replace(ipRe, `${m[1]}.${m[2]}.${m[3]}.${last}`);
        return { display: d, transit: (a) => a, change: "O MITM alterou o endereço IP exibido no enunciado." };
      }
      return {
        display: d,
        transit: (a) => (Array.isArray(a) ? (a as string[]).map((v, i) => (i === 0 ? `${v}9` : v)) : a),
        change: "O MITM alterou sua resposta em trânsito.",
      };
    }
    case "classify": {
      const idx = rng.int(0, d.items.length - 1);
      const n = d.categories.length;
      return {
        display: d,
        transit: (a) => (Array.isArray(a) ? (a as number[]).map((v, i) => (i === idx ? (v + 1) % n : v)) : a),
        change: "O MITM trocou a classificação de um item em trânsito.",
      };
    }
    case "rules": {
      const port = rng.pick(d.ports).port;
      return {
        display: d,
        transit: (a) => {
          if (!a || typeof a !== "object" || Array.isArray(a)) return a;
          const r = clone(a as { defaultPolicy: "allow" | "deny"; rules: { port: number; action: "allow" | "deny" }[] });
          const existing = r.rules.find((x) => x.port === port);
          if (existing) existing.action = existing.action === "allow" ? "deny" : "allow";
          else r.rules.push({ port, action: r.defaultPolicy === "allow" ? "deny" : "allow" });
          return r;
        },
        change: `O MITM inverteu a regra da porta ${port} em trânsito.`,
      };
    }
  }
}
