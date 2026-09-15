import { useEffect, useState } from "preact/hooks";
import type { ClassifyQuestion } from "@fireshot/sim";
import { t } from "../../i18n/t";
import { Button } from "../components/ui";

export function ClassifyView({ q, locked, items, onSubmit }: { q: ClassifyQuestion; locked: boolean; items: boolean[] | null; onSubmit: (a: number[]) => void }) {
  const [choice, setChoice] = useState<(number | null)[]>(() => q.items.map(() => null));
  useEffect(() => setChoice(q.items.map(() => null)), [q.seed]);
  const complete = choice.every((c) => c !== null);
  return (
    <div class="classify">
      <p class="term-hint">{t("terminal.classifyHint")}</p>
      <ol class="classify-list">
        {q.items.map((it, i) => (
          <li key={i} class={`classify-item ${locked && items ? (items[i] ? "ok" : "bad") : ""}`}>
            <div class="classify-text">
              <div class="classify-main">{it.text}</div>
              {it.detail.length > 0 && <ul class="classify-detail">{it.detail.map((d) => <li key={d}>{d}</li>)}</ul>}
              {locked && q.itemExplanations[i] && <p class="classify-expl">{q.itemExplanations[i]}</p>}
            </div>
            <div class="segmented" role="radiogroup" aria-label={it.text}>
              {q.categories.map((c, ci) => (
                <button
                  key={ci}
                  type="button"
                  role="radio"
                  aria-checked={choice[i] === ci}
                  disabled={locked}
                  class={`seg ${choice[i] === ci ? "sel" : ""} ${locked && q.answer[i] === ci ? "truth" : ""}`}
                  onClick={() => { const n = [...choice]; n[i] = ci; setChoice(n); }}
                >
                  {c}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {!locked && <Button disabled={!complete} onClick={() => onSubmit(choice.map((c) => c ?? -1))}>{t("terminal.submit")}</Button>}
    </div>
  );
}
