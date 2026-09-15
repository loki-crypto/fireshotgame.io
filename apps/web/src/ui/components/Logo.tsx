import { t } from "../../i18n/t";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div class={`logo ${small ? "small" : ""}`} aria-label={`${t("app.name")}: ${t("app.tagline")}`}>
      <svg viewBox="0 0 64 64" width={small ? 30 : 64} height={small ? 30 : 64} aria-hidden="true">
        <path d="M32 6 54 15v15c0 14-9.5 24-22 28C19.5 54 10 44 10 30V15z" fill="none" stroke="#39d0ff" stroke-width="3.5" />
        <path d="M20 33h8l4-9 5 16 4-7h4" fill="none" stroke="#3dffc5" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <div>
        <div class="logo-name">{t("app.name").toUpperCase()}</div>
        {!small && <div class="logo-tag">{t("app.tagline")}</div>}
      </div>
    </div>
  );
}
