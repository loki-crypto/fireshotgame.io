import { t } from "../../i18n/t";
import { navigate, serverOnline } from "../../app/store";
import { Button } from "../components/ui";
import { Logo } from "../components/Logo";

export function MenuScreen() {
  return (
    <main class="page menu">
      <div class="menu-hero">
        <Logo />
        <p class="menu-intro">{t("menu.intro")}</p>
        <div class="stack menu-actions">
          <Button onClick={() => navigate({ name: "auth", mode: "register" })} disabled={!serverOnline.value}>{t("menu.register")}</Button>
          <Button variant="ghost" onClick={() => navigate({ name: "auth", mode: "login" })} disabled={!serverOnline.value}>{t("menu.login")}</Button>
          <Button variant="ghost" onClick={() => navigate({ name: "game", phaseId: "00-tutorial", guest: true, nonce: Date.now() })}>{t("menu.guest")}</Button>
          <Button variant="ghost" onClick={() => navigate({ name: "game", phaseId: "lab", guest: true, nonce: Date.now() })}>{t("menu.lab")}</Button>
          <Button variant="ghost" onClick={() => navigate({ name: "settings" })}>{t("menu.settings")}</Button>
        </div>
        {!serverOnline.value && <p class="warn">{t("app.offline")}</p>}
        <p class="muted small">{t("menu.guestNote")}</p>
        <nav class="legal-links">
          <a href="#" onClick={(e) => { e.preventDefault(); navigate({ name: "legal", doc: "terms", back: { name: "menu" } }); }}>{t("menu.terms")}</a>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate({ name: "legal", doc: "privacy", back: { name: "menu" } }); }}>{t("menu.privacy")}</a>
          <a href="/verificar">{t("verify.title")}</a>
        </nav>
      </div>
    </main>
  );
}
