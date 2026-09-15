/**
 * Questões de terminal. Geradas deterministicamente a partir de uma seed.
 * O servidor (Python) possui geradores espelho e revalida as respostas a partir da mesma seed.
 */
export type ContextBlock =
  | { type: "table"; title: string; headers: string[]; rows: string[][] }
  | { type: "text"; text: string }
  | { type: "code"; text: string };

interface QuestionBase {
  generator: string;
  seed: number;
  prompt: string;
  context: ContextBlock[];
  explanation: string;
  hint: string;
  /** contadores de badges alimentados por esta questão (ex.: "subnet", "phishing_items") */
  tags: string[];
}

export interface McQuestion extends QuestionBase {
  kind: "mc";
  options: string[];
  answer: number;
}

export interface MatchQuestion extends QuestionBase {
  kind: "match";
  left: string[];
  right: string[];
  /** answer[i] = índice em `right` que corresponde a left[i] */
  answer: number[];
}

export interface NumericField {
  label: string;
  format: "int" | "ipv4" | "text";
  placeholder: string;
}

export interface NumericQuestion extends QuestionBase {
  kind: "numeric";
  fields: NumericField[];
  answer: string[];
}

export interface ClassifyItem {
  text: string;
  detail: string[];
}

export interface ClassifyQuestion extends QuestionBase {
  kind: "classify";
  categories: string[];
  items: ClassifyItem[];
  /** categoria correta de cada item */
  answer: number[];
  itemExplanations: string[];
}

export interface RulesPort {
  port: number;
  service: string;
  description: string;
}

export interface RulesAnswer {
  defaultPolicy: "allow" | "deny";
  rules: { port: number; action: "allow" | "deny" }[];
}

export interface RulesQuestion extends QuestionBase {
  kind: "rules";
  ports: RulesPort[];
  /** portas que devem ficar acessíveis; todas as outras listadas devem ficar bloqueadas */
  answer: { allowed: number[] };
}

export type Question = McQuestion | MatchQuestion | NumericQuestion | ClassifyQuestion | RulesQuestion;

export type AnswerValue = number | number[] | string[] | RulesAnswer;

export interface CheckResult {
  correct: boolean;
  /** acerto por item (match, numeric, classify, rules) */
  items: boolean[];
}
