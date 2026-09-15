import { useEffect, useState } from "preact/hooks";
import type { MatchQuestion } from "@fireshot/sim";
import { t } from "../../i18n/t";
import { Button } from "../components/ui";

const COLORS = ["#39d0ff", "#3dff8a", "#ffd23d", "#ff7a3d", "#b45cff", "#ff3df0"];

export function MatchView({ q, locked, items, onSubmit }: { q: MatchQuestion; locked: boolean; items: boolean[] | null; onSubmit: (a: number[]) => void }) {
  const [pairs, setPairs] = useState<(number | null)[]>(() => q.left.map(() => null));
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => { setPairs(q.left.map(() => null)); setActive(null); }, [q.seed]);

  const pickRight = (ri: number): void => {
    if (locked || active === null) return;
    const next = pairs.map((p) => (p === ri ? null : p));
    next[active] = ri;
    setPairs(next);
    const nextEmpty = next.findIndex((p) => p === null);
    setActive(nextEmpty >= 0 ? nextEmpty : null);
  };
  const colorOfRight = (ri: number): string | undefined => {
    const li = pairs.indexOf(ri);
    return li >= 0 ? COLORS[li % COLORS.length] : undefined;
  };
  const complete = pairs.every((p) => p !== null);

  return (
    <div class="match">
      <p class="term-hint">{t("terminal.dragHint")}</p>
      <div class="match-cols">
        <ol class="match-left">
          {q.left.map((l, i) => {
            const res = locked && items ? (items[i] ? "ok" : "bad") : "";
            return (
              <li key={i}>
                <button type="button" disabled={locked} class={`match-item ${active === i ? "sel" : ""} ${res}`} style={{ borderColor: pairs[i] !== null ? COLORS[i % COLORS.length] : undefined }} onClick={() => setActive(i)} aria-pressed={active === i}>
                  <span class="match-dot" style={{ background: COLORS[i % COLORS.length] }} />
                  {l}
                  {pairs[i] !== null && <span class="match-arrow">→ {q.right[pairs[i]!]}</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <ul class="match-right">
          {q.right.map((r, i) => (
            <li key={i}>
              <button type="button" disabled={locked || active === null} class="match-item" style={{ borderColor: colorOfRight(i) }} onClick={() => pickRight(i)}>
                {colorOfRight(i) && <span class="match-dot" style={{ background: colorOfRight(i) }} />}
                {r}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {!locked && (
        <div class="row">
          <Button variant="ghost" small onClick={() => { setPairs(q.left.map(() => null)); setActive(0); }}>{t("settings.reset")}</Button>
          <Button disabled={!complete} onClick={() => onSubmit(pairs.map((p) => p ?? -1))}>{t("terminal.submit")}</Button>
        </div>
      )}
    </div>
  );
}
