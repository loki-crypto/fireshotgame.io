import { useEffect, useState } from "preact/hooks";
import type { ContentRegistry } from "@fireshot/sim";
import { api, type BadgeEarned } from "../../api/client";
import { t } from "../../i18n/t";
import { Panel, ShapeIcon } from "../components/ui";

export function BadgesTab({ reg }: { reg: ContentRegistry }) {
  const [earned, setEarned] = useState<BadgeEarned[] | null>(null);
  useEffect(() => { api.badges().then((r) => setEarned(r.earned)).catch(() => setEarned([])); }, []);
  const byId = new Map((earned ?? []).map((e) => [e.id, e]));
  return (
    <Panel title={t("badges.title")} actions={<span class="muted">{byId.size} / {reg.badges.length}</span>}>
      <div class="badge-grid">
        {reg.badges.map((b) => {
          const e = byId.get(b.id);
          return (
            <article key={b.id} class={`badge-card ${e ? "earned" : ""}`}>
              <ShapeIcon shape={b.icon.shape} color={b.icon.color} size={64} muted={!e} />
              <h3>{b.name}</h3>
              <p>{b.description}</p>
              <small class="muted">{e ? t("badges.earned", { date: new Date(e.earnedAt).toLocaleDateString("pt-BR") }) : t("badges.notEarned")}</small>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
