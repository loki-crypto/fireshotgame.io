import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, ApiError, type VerifyResponse } from "../api/client";
import { t } from "../i18n/t";
import "../styles/base.css";
import "../styles/ui.css";

function codeFromPath(): string {
  const m = window.location.pathname.match(/\/verificar\/([A-Za-z0-9-]+)/);
  return m ? decodeURIComponent(m[1]!) : new URLSearchParams(window.location.search).get("codigo") ?? "";
}

function VerifyPage() {
  const [code, setCode] = useState(codeFromPath());
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  const check = async (c: string): Promise<void> => {
    if (!c) return;
    setLoading(true);
    setNotFound(false);
    setData(null);
    try {
      setData(await api.verify(c.trim().toUpperCase()));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setNotFound(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (code) void check(code); }, []);

  const status = data ? (data.revoked ? "revoked" : data.valid && data.signatureOk ? "valid" : "bad") : null;
  return (
    <main class="page verify">
      <div class="verify-card">
        <div class="logo small"><div class="logo-name">FIRESHOT</div></div>
        <h1>{t("verify.title")}</h1>
        <form class="row" onSubmit={(e) => { e.preventDefault(); history.replaceState(null, "", `/verificar/${code.trim().toUpperCase()}`); void check(code); }}>
          <label class="field grow">
            <span>{t("verify.codeLabel")}</span>
            <input value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" />
          </label>
          <button type="submit" class="btn btn-primary">{t("verify.check")}</button>
        </form>
        {loading && <p class="muted">{t("app.loading")}</p>}
        {notFound && <p class="verify-status bad" role="alert">✖ {t("verify.invalid")}</p>}
        {data && (
          <section class={`verify-result ${status}`}>
            <p class={`verify-status ${status}`} role="status">
              {status === "valid" ? `✔ ${t("verify.valid")}` : status === "revoked" ? `✖ ${t("verify.revoked")}` : `✖ ${t("verify.signatureBad")}`}
            </p>
            <p class={data.signatureOk ? "ok" : "warn"}>{data.signatureOk ? t("verify.signatureOk") : t("verify.signatureBad")}</p>
            <dl class="stats">
              <dt>{t("verify.holder")}</dt><dd>{data.anonymized ? t("verify.anonymized") : data.fullName}</dd>
              <dt>{t("verify.hours")}</dt><dd>{data.activeHours} h</dd>
              <dt>{t("verify.issuedAt")}</dt><dd>{new Date(data.issuedAt).toLocaleDateString("pt-BR")}</dd>
              <dt>Código</dt><dd><code>{data.code}</code></dd>
            </dl>
            <h3>{t("verify.modules")}</h3>
            <ul class="objectives">{data.modules.map((m) => <li key={m}>{m}</li>)}</ul>
            <p class="muted small">{t("verify.disclaimer")}</p>
          </section>
        )}
      </div>
    </main>
  );
}

render(<VerifyPage />, document.getElementById("verify")!);
