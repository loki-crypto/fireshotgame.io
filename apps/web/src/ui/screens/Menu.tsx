import { useState } from "preact/hooks";
import { avatars, curriculum, registry } from "@fireshot/content";
import { t } from "../../i18n/t";
import { settings } from "../../app/settings";
import { navigate, serverOnline } from "../../app/store";
import { AvatarPicker } from "../components/AvatarPicker";
import { DesktopNotice } from "../components/DesktopNotice";
import { Button } from "../components/ui";
import { Logo } from "../components/Logo";
import { PixelArt } from "../components/PixelArt";

export function MenuScreen() {
  const [agent, setAgent] = useState(avatars[0]!.id);
  const chosen = avatars.find((a) => a.id === agent) ?? avatars[0]!;
  const online = serverOnline.value;
  const phases = curriculum();

  return (
    <main class={`page menu ${settings.value.reduceMotion ? "still" : ""}`}>
      <header class="menu-top">
        <Logo />
        <Button variant="ghost" small onClick={() => navigate({ name: "settings" })}>{t("menu.settings")}</Button>
      </header>

      <DesktopNotice />

      <div class="title-screen">
        <section class="menu-hero">
          <h1 class="menu-headline">{t("menu.headline")}</h1>
          <p class="menu-intro">{t("menu.intro")}</p>
          <div class="menu-actions">
            <Button class="btn-big" onClick={() => navigate({ name: "auth", mode: "register", avatar: agent })} disabled={!online}>
              <span aria-hidden="true">▶</span> {t("menu.registerPlay")}
            </Button>
            <Button variant="ghost" onClick={() => navigate({ name: "auth", mode: "login" })} disabled={!online}>{t("menu.login")}</Button>
          </div>
          {!online && <p class="warn">{t("app.offline")}</p>}
          <div class="menu-guest">
            <p class="muted small">{t("menu.guestNote")}</p>
            <div class="row">
              <Button variant="ghost" small onClick={() => navigate({ name: "game", phaseId: "00-tutorial", guest: true, nonce: Date.now() })}>{t("menu.guest")}</Button>
              <Button variant="ghost" small onClick={() => navigate({ name: "game", phaseId: "lab", guest: true, nonce: Date.now() })}>{t("menu.lab")}</Button>
            </div>
          </div>
        </section>

        <section class="agent-card" aria-labelledby="menu-agent-title">
          <h2 id="menu-agent-title">{t("avatar.choose")}</h2>
          <div class="agent-stage">
            <div class="agent-sprite" key={chosen.id}>
              <PixelArt sprite={chosen} size={168} label={chosen.name} />
            </div>
            <div class="agent-floor" aria-hidden="true" />
          </div>
          <p class="agent-name">{chosen.name}</p>
          <p class="muted small agent-concept">{chosen.concept}</p>
          <AvatarPicker value={agent} onChange={setAgent} size={40} name="menu-avatar" />
          <Button variant="ghost" small disabled={!online} onClick={() => navigate({ name: "auth", mode: "register", avatar: agent })}>
            {t("menu.playAs", { name: chosen.name })}
          </Button>
        </section>
      </div>

      <section class="campaign" aria-labelledby="campaign-title">
        <div class="campaign-head">
          <h2 id="campaign-title">{t("menu.campaign")}</h2>
          <p class="muted">{t("menu.campaignNote", { n: phases.length })}</p>
        </div>
        <ol class="campaign-route">
          {phases.map((p) => {
            const enemy = registry.enemies.find((e) => e.id === (p.introducesEnemies ?? [])[0]);
            const accent = p.ambient?.accent ?? "#39d0ff";
            return (
              <li key={p.id} class="campaign-stop" style={{ "--stop": accent }}>
                <span class="stop-num">{p.order}</span>
                <span class="stop-title">{p.title}</span>
                {enemy && <span class="stop-enemy">{enemy.name}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <nav class="legal-links">
        <a href="#" onClick={(e) => { e.preventDefault(); navigate({ name: "legal", doc: "terms", back: { name: "menu" } }); }}>{t("menu.terms")}</a>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate({ name: "legal", doc: "privacy", back: { name: "menu" } }); }}>{t("menu.privacy")}</a>
        <a href="/verificar">{t("verify.title")}</a>
        <a href="mailto:fireshotIO@gmail.com">{t("menu.contact")}</a>
      </nav>
    </main>
  );
}
