import type { ContentRegistry } from "@fireshot/sim";
import { avatarById, curriculum } from "@fireshot/content";
import { t, formatHours } from "../../i18n/t";
import { logout, navigate, progress, user } from "../../app/store";
import { Meter } from "../components/ui";
import { PixelArt } from "../components/PixelArt";
import { nextUnlock } from "./unlocks";

/** Cabeçalho do hub: o agente, nível, recursos e o que já foi (e o que vai ser) desbloqueado. */
export function PlayerCard({ reg }: { reg: ContentRegistry }) {
  const u = user.value!;
  const sprite = avatarById(u.avatar);
  const phases = curriculum();
  const done = phases.filter((p) => progress.value?.phases.find((x) => x.phaseId === p.id)?.completed).length;
  const upcoming = nextUnlock(u.level, reg.upgrades);
  const levelHint = t("hub.nextLevel", { current: u.levelInfo.intoLevel, needed: u.levelInfo.needed, next: u.level + 1 });

  const unlocks = [
    { key: "phases", value: done, total: phases.length },
    { key: "upgrades", value: u.upgradesOwned.length, total: reg.upgrades.length },
    { key: "badges", value: u.badges.length, total: reg.badges.length },
    { key: "slots", value: u.loadout.length, total: u.slots },
  ];

  return (
    <header class="player-card">
      <button type="button" class="player-avatar" onClick={() => navigate({ name: "hub", tab: "profile" })} title={t("avatar.change")} aria-label={`${sprite.name}. ${t("avatar.change")}`}>
        <PixelArt sprite={sprite} size={104} />
      </button>

      <div class="player-main">
        <div class="player-id">
          <span class="player-name">{u.name}</span>
          <span class="player-handle">@{u.username}</span>
        </div>
        <div class="player-level">
          <span class="level-badge" aria-label={t("hub.level", { level: u.level })}>
            <small aria-hidden="true">{t("hub.levelShort")}</small>
            <b aria-hidden="true">{u.level}</b>
          </span>
          <div class="player-xp">
            <Meter value={u.levelInfo.intoLevel} max={u.levelInfo.needed} color="#39d0ff" label={levelHint} />
            <small class="muted">{levelHint}</small>
          </div>
        </div>
        <ul class="unlock-list" aria-label={t("hub.unlocks")}>
          {unlocks.map((x) => (
            <li key={x.key} class={x.total > 0 && x.value >= x.total ? "full" : ""}>
              <b>{x.value}<span>/{x.total}</span></b>
              <small>{t(`hub.unlock.${x.key}`)}</small>
            </li>
          ))}
        </ul>
        {upcoming && (
          <p class="next-unlock">
            <span>{t("hub.nextUnlock", { level: upcoming.level })}</span>
            {upcoming.slot && <span class="chip">{t("hub.unlockSlot")}</span>}
            {upcoming.upgrades.map((x) => <span key={x.id} class="chip">{x.name}</span>)}
          </p>
        )}
      </div>

      <div class="player-side">
        <span class="stat-chip" title={t("shop.title")}>◆ {t("hub.bytes", { bytes: u.bytes })}</span>
        <span class="stat-chip" title={t("hub.activeTime")}>⏱ {formatHours(u.activeSeconds)}</span>
        <button type="button" class="btn btn-ghost btn-small" onClick={() => void logout()}>{t("auth.logout")}</button>
      </div>
    </header>
  );
}
