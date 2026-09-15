import { registry } from "@fireshot/content";
import { t, formatHours } from "../../i18n/t";
import { logout, navigate, user, type HubTab } from "../../app/store";
import { Meter } from "../components/ui";
import { Logo } from "../components/Logo";
import { PhaseMap } from "./PhaseMap";
import { Shop } from "./Shop";
import { BadgesTab } from "./Badges";
import { ProfileTab } from "./Profile";
import { CertificateTab } from "./Certificate";
import { SettingsPanel } from "../screens/Settings";

const TABS: HubTab[] = ["map", "shop", "badges", "profile", "certificate", "settings"];

export function Hub({ tab }: { tab: HubTab }) {
  const u = user.value;
  if (!u) return null;
  return (
    <main class="page hub">
      <header class="hub-bar">
        <Logo small />
        <div class="hub-player">
          <div class="hub-name">{u.name}</div>
          <div class="hub-level">
            <span class="level-chip">{t("hub.level", { level: u.level })}</span>
            <Meter value={u.levelInfo.intoLevel} max={u.levelInfo.needed} color="#39d0ff" label={t("hub.nextLevel", { current: u.levelInfo.intoLevel, needed: u.levelInfo.needed, next: u.level + 1 })} />
            <small class="muted">{t("hub.nextLevel", { current: u.levelInfo.intoLevel, needed: u.levelInfo.needed, next: u.level + 1 })}</small>
          </div>
        </div>
        <div class="hub-stats">
          <span class="stat-chip" title={t("shop.title")}>◆ {t("hub.bytes", { bytes: u.bytes })}</span>
          <span class="stat-chip" title={t("hub.activeTime")}>⏱ {formatHours(u.activeSeconds)}</span>
          <button type="button" class="btn btn-ghost btn-small" onClick={() => void logout()}>{t("auth.logout")}</button>
        </div>
      </header>
      <nav class="hub-tabs" role="tablist">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} class={`hub-tab ${tab === id ? "active" : ""}`} onClick={() => navigate({ name: "hub", tab: id })}>
            {t(`hub.${id === "map" ? "map" : id}`)}
          </button>
        ))}
      </nav>
      <div class="hub-content" role="tabpanel">
        {tab === "map" && <PhaseMap reg={registry} />}
        {tab === "shop" && <Shop reg={registry} />}
        {tab === "badges" && <BadgesTab reg={registry} />}
        {tab === "profile" && <ProfileTab reg={registry} />}
        {tab === "certificate" && <CertificateTab />}
        {tab === "settings" && <SettingsPanel />}
      </div>
    </main>
  );
}
