import { useEffect, useState } from "preact/hooks";
import { avatarById, defaultAvatar } from "@fireshot/content";
import { api, ApiError, errorMessage } from "../../api/client";
import { navigate, refreshUser } from "../../app/store";
import { t } from "../../i18n/t";
import { AvatarPicker } from "../components/AvatarPicker";
import { Button } from "../components/ui";
import { Logo } from "../components/Logo";
import { PixelArt } from "../components/PixelArt";

/** Mesma regra do servidor (apps/api/app/schemas.py → USERNAME_RE). */
export const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,15}$/;

type UsernameState = "empty" | "invalid" | "checking" | "available" | "taken" | "unknown";

/** Sugere um username a partir do nome enquanto a pessoa não digitou um próprio. */
export function suggestUsername(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+/, "")
    .slice(0, 16);
}

export function AuthScreen({ mode, avatar: initialAvatar }: { mode: "login" | "register"; avatar?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameState, setUsernameState] = useState<UsernameState>("empty");
  const [avatar, setAvatar] = useState(avatarById(initialAvatar ?? defaultAvatar).id);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = mode === "register";

  // disponibilidade do username: consulta com atraso para não disparar a cada tecla
  useEffect(() => {
    if (!register) return;
    const value = username.trim();
    if (!value) { setUsernameState("empty"); return; }
    if (!USERNAME_RE.test(value)) { setUsernameState("invalid"); return; }
    setUsernameState("checking");
    let alive = true;
    const id = window.setTimeout(() => {
      api.usernameStatus(value)
        .then((r) => { if (alive) setUsernameState(!r.valid ? "invalid" : r.available ? "available" : "taken"); })
        .catch(() => { if (alive) setUsernameState("unknown"); });
    }, 400);
    return () => { alive = false; window.clearTimeout(id); };
  }, [username, register]);

  const onName = (value: string): void => {
    setName(value);
    if (!usernameTouched) setUsername(suggestUsername(value));
  };

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (register && !USERNAME_RE.test(username.trim())) { setError(t("auth.errors.invalid_username")); return; }
    if (register && usernameState === "taken") { setError(t("auth.errors.username_taken")); return; }
    if (register && password.length < 8) { setError(t("auth.errors.weak_password")); return; }
    if (register && !accepted) { setError(t("auth.errors.terms_required")); return; }
    setBusy(true);
    try {
      if (register) await api.register({ email, username: username.trim(), password, name, avatar, acceptedTerms: accepted });
      else await api.login({ email, password });
      await refreshUser();
      navigate({ name: "hub", tab: "map" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "username_taken") setUsernameState("taken");
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const [pre, post] = t("auth.acceptTerms", { terms: "§T§", privacy: "§P§" }).split("§T§");
  const [mid, end] = (post ?? "").split("§P§");
  const chosen = avatarById(avatar);
  const back = { name: "auth", mode, avatar } as const;

  const form = (
    <>
      {register && (
        <>
          <label class="field">
            <span>{t("auth.name")}</span>
            <input name="name" required maxLength={60} placeholder={t("auth.namePlaceholder")} value={name} onInput={(e) => onName((e.target as HTMLInputElement).value)} autoComplete="nickname" />
          </label>
          <label class="field">
            <span>{t("auth.username")}</span>
            <input
              name="username" required maxLength={16} value={username} spellcheck={false} autoCapitalize="off" autoComplete="username"
              aria-invalid={usernameState === "invalid" || usernameState === "taken"} aria-describedby="username-status"
              onInput={(e) => { setUsernameTouched(true); setUsername((e.target as HTMLInputElement).value); }}
            />
            <small id="username-status" class={`username-status ${usernameState}`} aria-live="polite">{t(`auth.usernameState.${usernameState}`)}</small>
          </label>
        </>
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
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ name: "legal", doc: "terms", back }); }}>{t("auth.termsLink")}</a>
            {mid}
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ name: "legal", doc: "privacy", back }); }}>{t("auth.privacyLink")}</a>
            {end}
          </span>
        </label>
      )}
      {error && <p class="form-error" role="alert">{error}</p>}
      <Button type="submit" class="btn-big" disabled={busy}>{register ? t("auth.submitRegister") : t("auth.submitLogin")}</Button>
      <div class="row between">
        <Button variant="ghost" small onClick={() => navigate({ name: "menu" })}>← {t("app.back")}</Button>
        <Button variant="ghost" small onClick={() => navigate(register ? { name: "auth", mode: "login" } : { name: "auth", mode: "register", avatar })}>{register ? t("auth.haveAccount") : t("auth.noAccount")}</Button>
      </div>
    </>
  );

  return (
    <main class="page auth">
      <form class={`auth-card ${register ? "register" : ""}`} onSubmit={submit} noValidate>
        <Logo small />
        <h1>{register ? t("auth.registerTitle") : t("menu.login")}</h1>
        {register ? (
          <div class="register-grid">
            <section class="agent-select" aria-labelledby="agent-title">
              <h2 id="agent-title">{t("avatar.choose")}</h2>
              <div class="agent-preview">
                <PixelArt sprite={chosen} size={132} label={chosen.name} />
                <div>
                  <strong class="agent-name">{chosen.name}</strong>
                  <p class="muted small">{chosen.concept}</p>
                  {username.trim() && <p class="agent-handle">@{username.trim()}</p>}
                </div>
              </div>
              <AvatarPicker value={avatar} onChange={setAvatar} size={44} />
              <p class="muted small">{t("avatar.changeLater")}</p>
            </section>
            <div class="register-fields">{form}</div>
          </div>
        ) : form}
      </form>
    </main>
  );
}
