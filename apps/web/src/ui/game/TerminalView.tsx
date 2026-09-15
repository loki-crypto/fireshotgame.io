import { useEffect } from "preact/hooks";
import type { AnswerValue } from "@fireshot/sim";
import { t } from "../../i18n/t";
import type { TerminalState } from "../../game/GameSession";
import { Button, Overlay } from "../components/ui";
import { ContextBlocks } from "../terminals/Context";
import { McView } from "../terminals/McView";
import { MatchView } from "../terminals/MatchView";
import { NumericView } from "../terminals/NumericView";
import { ClassifyView } from "../terminals/ClassifyView";
import { RulesView } from "../terminals/RulesView";

export function TerminalView({ st, onSubmit, onContinue, onClose }: { st: TerminalState; onSubmit: (a: AnswerValue) => void; onContinue: () => void; onClose: () => void }) {
  const q = st.display;
  const res = st.result;
  const locked = res !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === "Escape") { e.preventDefault(); onClose(); }
      if (res && e.code === "Enter") { e.preventDefault(); onContinue(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Overlay class={`terminal ${st.tampered ? "intercepted" : ""}`} label={st.title}>
      <div class="terminal-card">
        <header class="terminal-head">
          <div>
            <span class="eyebrow">{t("terminal.header", { concept: st.concept })}</span>
            <h1>{st.title}</h1>
          </div>
          <div class="terminal-meta">
            <span>{t("terminal.challenge", { n: st.challengeIndex + 1, total: st.challenges })}</span>
            <span>{t("terminal.attempt", { n: st.attemptNo })}</span>
            <button type="button" class="icon-btn" onClick={onClose} aria-label={t("terminal.close")}>✕</button>
          </div>
        </header>

        {st.tampered && (
          <div class="intercept-banner" role="alert">
            <strong>🔓 {t("terminal.intercepted")}</strong>
            <span>{t("terminal.interceptedTip")}</span>
          </div>
        )}

        <div class="terminal-body">
          <p class="term-prompt">{q.prompt}</p>
          <ContextBlocks blocks={q.context} />
          {st.hint && !locked && <p class="term-hint-box"><strong>{t("terminal.hint")}:</strong> {st.hint}</p>}
          {q.kind === "mc" && <McView q={q} locked={locked} correctIndex={locked && !st.tampered ? st.question.kind === "mc" ? st.question.answer : null : null} onSubmit={onSubmit} />}
          {q.kind === "match" && <MatchView q={q} locked={locked} items={res?.items ?? null} onSubmit={onSubmit} />}
          {q.kind === "numeric" && <NumericView q={q} locked={locked} items={res?.items ?? null} onSubmit={onSubmit} />}
          {q.kind === "classify" && <ClassifyView q={q} locked={locked} items={res?.items ?? null} onSubmit={onSubmit} />}
          {q.kind === "rules" && <RulesView q={q} locked={locked} items={res?.items ?? null} onSubmit={onSubmit} />}
        </div>

        {res && (
          <div class={`term-result ${res.correct ? "ok" : "bad"}`} role="status">
            <h2>{res.correct ? t("terminal.correct") : t("terminal.wrong")}</h2>
            {res.tamperNote && <p class="tamper-note">{res.tamperNote}</p>}
            <h3>{t("terminal.whyTitle")}</h3>
            <p>{res.explanation}</p>
            {res.xpDelta !== null && res.xpDelta > 0 && <p class="xp-note">+{res.xpDelta} XP</p>}
            {st.pending && <p class="muted">{t("terminal.pending")}</p>}
            {res.serverMismatch && <p class="warn">{t("terminal.serverMismatch")}</p>}
            <div class="row">
              <Button variant="ghost" onClick={onClose}>{t("terminal.close")}</Button>
              <Button onClick={onContinue} autoFocus>
                {res.solvedTerminal ? t("app.continue") : res.correct ? t("terminal.next") : t("terminal.retry")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}
