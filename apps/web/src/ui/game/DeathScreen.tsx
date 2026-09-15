import { useEffect } from "preact/hooks";
import { t } from "../../i18n/t";
import type { DeathState } from "../../game/GameSession";
import { Button, Overlay, ShapeIcon } from "../components/ui";

const SPECIAL: Record<string, { name: string; death: string; tip: string }> = {
  phishing: {
    name: "Isca de phishing",
    death: "Você seguiu uma mensagem falsa e pegou um item-isca. Mensagens de phishing imitam remetentes confiáveis e criam urgência.",
    tip: "Antes de agir, confira o domínio do remetente, desconfie de urgência e ofertas boas demais. Denuncie com F.",
  },
};

export function DeathScreen({ death, onRespawn, onQuit }: { death: DeathState; onRespawn: () => void; onQuit: () => void }) {
  const special = death.causeKey ? SPECIAL[death.causeKey] : undefined;
  const name = death.cause?.name ?? special?.name ?? t("death.unknown");
  const why = death.cause?.explain.death ?? special?.death;
  const tip = death.cause?.explain.tip ?? special?.tip;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.code === "Enter") onRespawn(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Overlay class="death" label={t("death.title")}>
      <div class="death-card">
        <h1>{t("death.title")}</h1>
        <div class="death-cause">
          {death.cause && <ShapeIcon shape={death.cause.shape} color={death.cause.color} size={56} />}
          <div>
            <p class="eyebrow">{t("death.cause", { name })}</p>
            {death.cause && <p class="muted">{death.cause.concept}</p>}
          </div>
        </div>
        {why && (<><h3>{t("death.why")}</h3><p>{why}</p></>)}
        {death.context.map((c) => <p key={c} class="context-note">{c}</p>)}
        {tip && (<><h3>{t("death.tip")}</h3><p class="tip">{tip}</p></>)}
        <div class="row">
          <Button variant="ghost" onClick={onQuit}>{t("pause.quit")}</Button>
          <Button onClick={onRespawn} autoFocus>{t("death.respawn")}</Button>
        </div>
      </div>
    </Overlay>
  );
}
