import { useEffect, useState } from "preact/hooks";
import type { McQuestion } from "@fireshot/sim";
import { t } from "../../i18n/t";
import { Button } from "../components/ui";

export function McView({ q, locked, correctIndex, onSubmit }: { q: McQuestion; locked: boolean; correctIndex: number | null; onSubmit: (a: number) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [q.seed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (locked) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) setSel(n - 1);
      if (e.key === "Enter" && sel !== null) onSubmit(sel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div class="mc">
      <div class="mc-options" role="radiogroup" aria-label={q.prompt}>
        {q.options.map((o, i) => {
          const state = locked ? (i === correctIndex ? "ok" : i === sel ? "bad" : "") : i === sel ? "sel" : "";
          return (
            <button key={i} type="button" role="radio" aria-checked={sel === i} disabled={locked} class={`mc-option ${state}`} onClick={() => setSel(i)}>
              <span class="mc-key">{i + 1}</span>
              <span>{o}</span>
            </button>
          );
        })}
      </div>
      {!locked && <Button disabled={sel === null} onClick={() => sel !== null && onSubmit(sel)}>{t("terminal.submit")}</Button>}
    </div>
  );
}
