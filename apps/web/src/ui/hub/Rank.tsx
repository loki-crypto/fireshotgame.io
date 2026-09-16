import { useEffect, useState } from "preact/hooks";
import { avatarById, curriculum } from "@fireshot/content";
import { api, errorMessage, type Leaderboard, type LeaderboardEntry } from "../../api/client";
import { navigate, user } from "../../app/store";
import { t, formatTime } from "../../i18n/t";
import { Button, Panel, Spinner } from "../components/ui";
import { PixelArt } from "../components/PixelArt";

type Scope = "global" | "phase";

/** Ordem visual do pódio: 2º, 1º, 3º. */
const PODIUM_ORDER = [1, 0, 2];

function timeOf(board: Leaderboard, e: LeaderboardEntry): string {
  return formatTime(board.scope === "phase" ? (e.bestTimeS ?? 0) : e.totalTimeS);
}

export function RankTab() {
  const phases = curriculum();
  const [scope, setScope] = useState<Scope>("global");
  const [phaseId, setPhaseId] = useState(phases[0]!.id);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const me = user.value?.username.toLowerCase();

  useEffect(() => {
    let alive = true;
    setBoard(null);
    setError(null);
    api.leaderboard(scope === "phase" ? phaseId : null)
      .then((b) => { if (alive) setBoard(b); })
      .catch((err) => { if (alive) setError(errorMessage(err, t)); });
    return () => { alive = false; };
  }, [scope, phaseId, nonce]);

  const isMe = (e: LeaderboardEntry): boolean => e.username.toLowerCase() === me;
  const podium = board?.entries.slice(0, 3) ?? [];
  const rest = board?.entries.slice(3) ?? [];
  const meOutside = board?.me && !board.entries.some(isMe) ? board.me : null;

  const row = (b: Leaderboard, e: LeaderboardEntry) => (
    <li key={`${e.position}-${e.username}`} class={`rank-row ${isMe(e) ? "me" : ""}`}>
      <span class="rank-pos">{e.position}</span>
      <PixelArt sprite={avatarById(e.avatar)} size={32} />
      <span class="rank-player">
        <b>@{e.username}</b>
        {isMe(e) && <span class="you-tag">{t("rank.you")}</span>}
        <small class="muted">{t("hub.level", { level: e.level })}</small>
      </span>
      {b.scope === "global" && <span class="rank-phases">{t("rank.phases", { n: e.phasesCompleted })}</span>}
      <span class="rank-time">{timeOf(b, e)}</span>
    </li>
  );

  return (
    <Panel
      title={t("rank.title")}
      class="rank"
      actions={
        <div class="rank-controls">
          <div class="segmented" role="group" aria-label={t("rank.scope")}>
            {(["global", "phase"] as const).map((s) => (
              <button key={s} type="button" class={`seg ${scope === s ? "sel" : ""}`} aria-pressed={scope === s} onClick={() => setScope(s)}>{t(`rank.${s}`)}</button>
            ))}
          </div>
          {scope === "phase" && (
            <label class="rank-phase">
              <span class="sr-only">{t("rank.phaseLabel")}</span>
              <select value={phaseId} onChange={(e) => setPhaseId((e.target as HTMLSelectElement).value)}>
                {phases.map((p) => <option key={p.id} value={p.id}>{t("hub.phase", { n: p.order })}: {p.title}</option>)}
              </select>
            </label>
          )}
        </div>
      }
    >
      <p class="muted">{t(scope === "global" ? "rank.ruleGlobal" : "rank.rulePhase")}</p>

      {error && (
        <div class="stack">
          <p class="form-error" role="alert">{error}</p>
          <Button small variant="ghost" onClick={() => setNonce((n) => n + 1)}>{t("app.retry")}</Button>
        </div>
      )}
      {!board && !error && <Spinner label={t("app.loading")} />}

      {board && board.entries.length === 0 && (
        <div class="rank-empty">
          <p>{t(scope === "global" ? "rank.emptyGlobal" : "rank.emptyPhase")}</p>
          <Button onClick={() => navigate({ name: "hub", tab: "map" })}>{t("rank.goPlay")}</Button>
        </div>
      )}

      {board && podium.length > 0 && (
        <ol class="podium" aria-label={t("rank.podium")}>
          {PODIUM_ORDER.filter((i) => podium[i]).map((i) => {
            const e = podium[i]!;
            return (
              <li key={e.username} class={`podium-spot place-${e.position} ${isMe(e) ? "me" : ""}`} aria-label={t("rank.placeLabel", { position: e.position, username: e.username, time: timeOf(board, e) })}>
                <PixelArt sprite={avatarById(e.avatar)} size={e.position === 1 ? 96 : 76} />
                <b class="podium-name">@{e.username}</b>
                <small class="podium-meta">
                  {board.scope === "global" && <>{t("rank.phases", { n: e.phasesCompleted })} · </>}
                  {timeOf(board, e)}
                </small>
                <div class="podium-block" aria-hidden="true">{e.position}</div>
              </li>
            );
          })}
        </ol>
      )}

      {board && (rest.length > 0 || meOutside) && (
        <ol class="rank-list">
          {rest.map((e) => row(board, e))}
          {meOutside && (
            <>
              <li class="rank-gap" aria-hidden="true">⋯</li>
              {row(board, meOutside)}
            </>
          )}
        </ol>
      )}

      {board && board.entries.length > 0 && !board.me && <p class="muted small">{t("rank.notRanked")}</p>}
      {board && board.total > 0 && <p class="muted small">{t("rank.total", { total: board.total })}</p>}
    </Panel>
  );
}
