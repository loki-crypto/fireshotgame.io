import type { PhaseDef } from "@fireshot/sim";
import { t, formatTime } from "../../i18n/t";
import type { DebriefState } from "../../game/GameSession";
import { Button, Overlay, Spinner } from "../components/ui";

export function Debrief({ phase, st, online, onHub, onRetry, onNext, onRetrySend }: {
  phase: PhaseDef; st: DebriefState; online: boolean;
  onHub: () => void; onRetry: () => void; onNext: (() => void) | null; onRetrySend: () => void;
}) {
  const s = st.summary;
  const r = st.result;
  const firstTry = `${s.terminalsFirstTry} / ${phase.terminals.length}`;
  return (
    <Overlay class="debrief" label={t("debrief.title")}>
      <div class="debrief-card">
        <span class="eyebrow">{t("debrief.title")}</span>
        <h1>{phase.title}</h1>
        <div class="debrief-grid">
          <section>
            <h3>{t("debrief.learned")}</h3>
            <ul class="objectives">{phase.debriefing.summary.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          <section>
            <h3>{t("debrief.performance")}</h3>
            <dl class="stats">
              <dt>{t("debrief.time")}</dt><dd class={st.elapsed <= phase.parTime ? "ok" : ""}>{formatTime(st.elapsed)} <small>({t("debrief.par")}: {formatTime(phase.parTime)})</small></dd>
              <dt>{t("debrief.deaths")}</dt><dd class={s.deaths === 0 ? "ok" : ""}>{s.deaths}</dd>
              <dt>{t("debrief.kills")}</dt><dd>{s.kills}</dd>
              <dt>{t("debrief.strongKills")}</dt><dd>{s.killsStrong}</dd>
              <dt>{t("debrief.accuracy")}</dt><dd>{Math.round(s.accuracy * 100)}%</dd>
              <dt>{t("debrief.terminals")}</dt><dd>{firstTry}</dd>
              <dt>{t("debrief.bytes")}</dt><dd>{s.bytes}</dd>
            </dl>
          </section>
        </div>
        <section class="rewards">
          <h3>{t("debrief.xpTitle")}</h3>
          {!r && !st.error && <Spinner label={t("debrief.sending")} />}
          {st.error && (
            <div class="warn">
              <p>{st.error}</p>
              <Button small onClick={onRetrySend}>{t("app.retry")}</Button>
            </div>
          )}
          {r && r.offline && <p class="muted">{t("debrief.offlineNote")}</p>}
          {r && !r.offline && !r.accepted && <p class="warn">{t("debrief.rejected", { reasons: r.reasons.join(", ") })}</p>}
          {r && !r.offline && r.accepted && (
            <>
              <ul class="reward-lines">
                {r.breakdown.map((line) => (
                  <li key={line.key}><span>{t(`rewards.${line.key}`)}</span><span>{line.xp > 0 ? `+${line.xp} XP` : ""} {line.bytes > 0 ? `+${line.bytes} bytes` : ""}</span></li>
                ))}
              </ul>
              <p class="reward-total">{t("debrief.xpTotal", { xp: r.xpDelta })} · {t("debrief.bytesTotal", { bytes: r.bytesDelta })}</p>
              {r.leveledUp && <p class="level-up">{t("debrief.levelUp", { level: r.level })}</p>}
              {r.newBadges.length > 0 && <p class="badge-note">{r.newBadges.map((b) => t("badges.new", { name: b.name })).join(" · ")}</p>}
            </>
          )}
        </section>
        <div class="row">
          <Button variant="ghost" onClick={onRetry}>{t("debrief.retry")}</Button>
          {onNext && online && <Button variant="ghost" onClick={onNext}>{t("debrief.next")}</Button>}
          <Button onClick={onHub} autoFocus>{t("debrief.hub")}</Button>
        </div>
      </div>
    </Overlay>
  );
}
