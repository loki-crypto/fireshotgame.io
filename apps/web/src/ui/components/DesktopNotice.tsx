import { isTouchOnly } from "../../app/device";
import { t } from "../../i18n/t";

/** Aviso para celular/tablet: o jogo é para computador (teclado e mouse). */
export function DesktopNotice({ compact = false }: { compact?: boolean }) {
  if (!isTouchOnly()) return null;
  return (
    <div class={`desktop-notice ${compact ? "compact" : ""}`} role="note">
      <span class="desktop-notice-icon" aria-hidden="true">🖥️</span>
      <div>
        <strong>{t("device.title")}</strong>
        {!compact && <p>{t("device.text")}</p>}
      </div>
    </div>
  );
}
