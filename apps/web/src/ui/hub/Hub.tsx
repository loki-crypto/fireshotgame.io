import { registry } from "@fireshot/content";
import { t } from "../../i18n/t";
import { navigate, user, type HubTab } from "../../app/store";
import { Logo } from "../components/Logo";
import { PhaseMap } from "./PhaseMap";
import { PlayerCard } from "./PlayerCard";
import { RankTab } from "./Rank";
import { Shop } from "./Shop";
import { BadgesTab } from "./Badges";
import { ProfileTab } from "./Profile";
import { CertificateTab } from "./Certificate";
import { SettingsPanel } from "../screens/Settings";

const TABS: HubTab[] = ["map", "rank", "shop", "badges", "profile", "certificate", "settings"];

export function Hub({ tab }: { tab: HubTab }) {
  if (!user.value) return null;
  return (
    <main class="page hub">
      <div class="hub-top"><Logo small /></div>
      <PlayerCard reg={registry} />
      <nav class="hub-tabs" role="tablist">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} class={`hub-tab ${tab === id ? "active" : ""}`} onClick={() => navigate({ name: "hub", tab: id })}>
            {t(`hub.${id}`)}
          </button>
        ))}
      </nav>
      <div class="hub-content" role="tabpanel">
        {tab === "map" && <PhaseMap reg={registry} />}
        {tab === "rank" && <RankTab />}
        {tab === "shop" && <Shop reg={registry} />}
        {tab === "badges" && <BadgesTab reg={registry} />}
        {tab === "profile" && <ProfileTab reg={registry} />}
        {tab === "certificate" && <CertificateTab />}
        {tab === "settings" && <SettingsPanel />}
      </div>
    </main>
  );
}
