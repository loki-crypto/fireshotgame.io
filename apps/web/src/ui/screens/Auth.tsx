import { useState } from "preact/hooks";
import { api, errorMessage } from "../../api/client";
import { navigate, refreshUser } from "../../app/store";
import { t } from "../../i18n/t";
import { Button } from "../components/ui";
import { Logo } from "../components/Logo";

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = mode === "register";

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (register && password.length < 8) { setError(t("auth.errors.weak_password")); return; }
    if (register && !accepted) { setError(t("auth.errors.terms_required")); return; }
    setBusy(true);
    try {
      if (register) await api.register({ email, password, name, acceptedTerms: accepted });
      else await api.login({ email, password });
      await refreshUser();
      navigate({ name: "hub", tab: "map" });
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const [pre, post] = t("auth.acceptTerms", { terms: "§T§", privacy: "§P§" }).split("§T§");
  const [mid, end] = (post ?? "").split("§P§");

  return (
    <main class="page auth">
      <form class="auth-card" onSubmit={submit} noValidate>
        <Logo small />
        <h1>{register ? t("menu.register") : t("menu.login")}</h1>
        {register && (
          <label class="field">
            <span>{t("auth.name")}</span>
            <input name="name" required maxLength={80} placeholder={t("auth.namePlaceholder")} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} autoComplete="nickname" />
          </label>
        )}
        <label class="field">
          <span>{t("auth.email")}</span>
          <input name="email" type="email" required value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} autoComplete="email" />
        </label>
        <label class="field">
          <span>{t("auth.password")}</span>
          <input name="password" type="password" required minLength={register ? 8 : 1} value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} autoComplete={register ? "new-password" : "current-password"} />
          {register && <small class="muted">{t("auth.passwordHint")}</small>}
        </label>
        {register && (
          <label class="field-check">
            <input name="terms" type="checkbox" checked={accepted} onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)} />
            <span>
              {pre}
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ name: "legal", doc: "terms", back: { name: "auth", mode } }); }}>{t("auth.termsLink")}</a>
              {mid}
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ name: "legal", doc: "privacy", back: { name: "auth", mode } }); }}>{t("auth.privacyLink")}</a>
              {end}
            </span>
          </label>
        )}
        {error && <p class="form-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{register ? t("auth.submitRegister") : t("auth.submitLogin")}</Button>
        <div class="row between">
          <Button variant="ghost" small onClick={() => navigate({ name: "menu" })}>← {t("app.back")}</Button>
          <Button variant="ghost" small onClick={() => navigate({ name: "auth", mode: register ? "login" : "register" })}>{register ? t("auth.haveAccount") : t("auth.noAccount")}</Button>
        </div>
      </form>
    </main>
  );
}
