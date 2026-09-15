import { useEffect, useState } from "preact/hooks";
import { api, errorMessage, type Eligibility } from "../../api/client";
import { refreshUser } from "../../app/store";
import { t, formatHours } from "../../i18n/t";
import { Button, Meter, Panel, Spinner } from "../components/ui";

export function CertificateTab() {
  const [el, setEl] = useState<Eligibility | null>(null);
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (): void => { api.eligibility().then(setEl).catch((e) => setError(errorMessage(e, t))); };
  useEffect(load, []);

  if (!el) return <Panel title={t("certificate.title")}>{error ? <p class="form-error">{error}</p> : <Spinner label={t("app.loading")} />}</Panel>;

  const issue = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.issueCertificate({ fullName: name.trim(), acceptTerms: accept });
      await refreshUser();
      load();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const fmt = (key: string, v: number): string => (key === "accuracy" ? `${Math.round(v * 100)}%` : key === "activeTime" ? formatHours(v) : String(v));
  const cert = el.certificate;

  return (
    <div class="certificate">
      <Panel title={t("certificate.requirements")}>
        <ul class="req-list">
          {el.requirements.map((r) => (
            <li key={r.key} class={r.met ? "ok" : ""}>
              <div class="row between"><span>{r.met ? "✔" : "○"} {t(`certificate.req.${r.key}`)}</span><span>{fmt(r.key, r.current)} / {fmt(r.key, r.required)}</span></div>
              <Meter value={r.current} max={r.required} color={r.met ? "#3dff8a" : "#39d0ff"} label={t(`certificate.req.${r.key}`)} />
            </li>
          ))}
        </ul>
        <p class={el.eligible ? "ok" : "muted"}>{el.eligible ? t("certificate.eligible") : t("certificate.notEligible")}</p>
      </Panel>
      {cert && (
        <Panel title={t("certificate.issued")}>
          <p><strong>{cert.fullName}</strong></p>
          <p>{t("certificate.code", { code: cert.code })} · {t("certificate.hours", { hours: cert.activeHours })}</p>
          <div class="row">
            <a class="btn btn-primary" href={`/api/v1/certificates/${cert.code}.pdf`} target="_blank" rel="noopener">{t("certificate.download")}</a>
            <a class="btn btn-ghost" href={`/verificar/${cert.code}`} target="_blank" rel="noopener">{t("certificate.verifyLink")}</a>
          </div>
        </Panel>
      )}
      {!cert && el.eligible && (
        <Panel title={t("certificate.title")}>
          <label class="field">
            <span>{t("certificate.fullName")}</span>
            <input value={name} maxLength={120} onInput={(e) => setName((e.target as HTMLInputElement).value)} autoComplete="name" />
          </label>
          {name.trim().length >= 3 && (
            <div class="cert-preview" aria-label={t("certificate.preview")}>
              <span class="eyebrow">{t("certificate.preview")}</span>
              <p>Certificamos que <strong>{name.trim()}</strong> concluiu o percurso Fireshot: Defesa de Rede.</p>
            </div>
          )}
          <h3>{t("certificate.termsTitle")}</h3>
          <p class="terms-box">{t("certificate.terms")}</p>
          <label class="field-check"><input type="checkbox" checked={accept} onChange={(e) => setAccept((e.target as HTMLInputElement).checked)} /> {t("certificate.accept")}</label>
          {error && <p class="form-error" role="alert">{error}</p>}
          <Button disabled={!accept || name.trim().length < 3 || busy} onClick={() => void issue()}>{t("certificate.issue")}</Button>
        </Panel>
      )}
    </div>
  );
}
