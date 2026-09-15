import { useState } from "preact/hooks";
import type { ContentRegistry, UpgradeDef } from "@fireshot/sim";
import { api, errorMessage } from "../../api/client";
import { refreshUser, user } from "../../app/store";
import { t } from "../../i18n/t";
import { Button, Panel } from "../components/ui";

const BRANCHES = ["offense", "defense", "analysis"] as const;
const BRANCH_COLOR = { offense: "#ff7a3d", defense: "#3dffc5", analysis: "#b8ff3d" } as const;

export function Shop({ reg }: { reg: ContentRegistry }) {
  const u = user.value!;
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const owned = new Set(u.upgradesOwned);
  const loadout = new Set(u.loadout);

  const run = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await refreshUser();
      if (ok) setMsg(ok);
    } catch (err) {
      setMsg(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const status = (d: UpgradeDef): { canBuy: boolean; reason: string | null } => {
    if (owned.has(d.id)) return { canBuy: false, reason: null };
    if (u.level < d.requiresLevel) return { canBuy: false, reason: t("shop.requiresLevel", { level: d.requiresLevel }) };
    const missing = d.requires.filter((r) => !owned.has(r));
    if (missing.length) return { canBuy: false, reason: t("shop.requires", { names: missing.map((m) => reg.upgrades.find((x) => x.id === m)?.name ?? m).join(", ") }) };
    if (u.bytes < d.costBytes) return { canBuy: false, reason: t("shop.noBytes") };
    return { canBuy: true, reason: null };
  };

  const toggleEquip = (id: string): void => {
    const next = loadout.has(id) ? u.loadout.filter((x) => x !== id) : [...u.loadout, id];
    if (next.length > u.slots) { setMsg(t("shop.noSlots")); return; }
    void run(() => api.setLoadout(next), t("shop.saved"));
  };

  return (
    <div class="shop">
      <Panel title={t("shop.title")} actions={<span class="slots">{t("shop.slots", { used: u.loadout.length, total: u.slots })}</span>}>
        <p class="muted">{t("shop.slotsHint")}</p>
        {msg && <p class="notice" role="status">{msg}</p>}
        <div class="tree">
          {BRANCHES.map((b) => (
            <section key={b} class="branch" style={{ "--branch": BRANCH_COLOR[b] }}>
              <h3>{t(`shop.branch.${b}`)}</h3>
              {reg.upgrades.filter((d) => d.branch === b).sort((x, y) => x.tier - y.tier).map((d) => {
                const st = status(d);
                const isOwned = owned.has(d.id);
                const equipped = loadout.has(d.id);
                return (
                  <article key={d.id} class={`upgrade ${isOwned ? "owned" : ""} ${equipped ? "equipped" : ""}`} data-upgrade={d.id}>
                    <header><span class="tier">T{d.tier}</span><strong>{d.name}</strong></header>
                    <p>{d.description}</p>
                    {st.reason && <small class="muted">{st.reason}</small>}
                    <div class="row">
                      {!isOwned && <Button small disabled={!st.canBuy || busy} onClick={() => void run(() => api.buyUpgrade(d.id))}>{t("shop.buy", { cost: d.costBytes })}</Button>}
                      {isOwned && <Button small variant={equipped ? "ghost" : "primary"} disabled={busy} onClick={() => toggleEquip(d.id)}>{equipped ? t("shop.unequip") : t("shop.equip")}</Button>}
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </Panel>
    </div>
  );
}
