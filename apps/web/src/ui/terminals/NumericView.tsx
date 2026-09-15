import { useEffect, useState } from "preact/hooks";
import type { NumericQuestion } from "@fireshot/sim";
import { t } from "../../i18n/t";
import { Button } from "../components/ui";

export function NumericView({ q, locked, items, onSubmit }: { q: NumericQuestion; locked: boolean; items: boolean[] | null; onSubmit: (a: string[]) => void }) {
  const [values, setValues] = useState<string[]>(() => q.fields.map(() => ""));
  useEffect(() => setValues(q.fields.map(() => "")), [q.seed]);
  const filled = values.every((v) => v.trim() !== "");
  return (
    <form class="numeric" onSubmit={(e) => { e.preventDefault(); if (filled && !locked) onSubmit(values); }}>
      <p class="term-hint">{t("terminal.numericHint")}</p>
      {q.fields.map((f, i) => (
        <label key={i} class={`numeric-field ${locked && items ? (items[i] ? "ok" : "bad") : ""}`}>
          <span>{f.label}</span>
          <input
            type="text"
            inputMode={f.format === "int" ? "numeric" : "text"}
            autoComplete="off"
            spellcheck={false}
            placeholder={f.placeholder}
            value={values[i]}
            disabled={locked}
            autoFocus={i === 0}
            onInput={(e) => { const v = [...values]; v[i] = (e.target as HTMLInputElement).value; setValues(v); }}
          />
          {locked && items && !items[i] && <small class="expected">{t("terminal.wrong")}: {q.answer[i]}</small>}
        </label>
      ))}
      {!locked && <Button type="submit" disabled={!filled}>{t("terminal.submit")}</Button>}
    </form>
  );
}
