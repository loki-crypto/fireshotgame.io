import { useState } from "preact/hooks";
import type { ContentRegistry } from "@fireshot/sim";
import { curriculum } from "@fireshot/content";
import { api, errorMessage } from "../../api/client";
import { navigate, progress, user } from "../../app/store";
import { t, formatHours } from "../../i18n/t";
import { Button, Panel } from "../components/ui";
import { AvatarPicker } from "../components/AvatarPicker";

export function ProfileTab({ reg }: { reg: ContentRegistry }) {
  void reg;
  const u = user.value!;
  const prog = progress.value;
  const phases = curriculum();
  const done = phases.filter((p) => prog?.phases.find((x) => x.phaseId === p.id)?.completed).length;
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [anon, setAnon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const changeAvatar = async (id: string): Promise<void> => {
    setAvatarBusy(true);
    setAvatarMsg(null);
    try {
      user.value = await api.setAvatar(id); // a API devolve o perfil inteiro
      setAvatarMsg(t("avatar.saved"));
    } catch (err) {
      setAvatarMsg(errorMessage(err, t));
    } finally {
      setAvatarBusy(false);
    }
  };

  const del = async (): Promise<void> => {
    setError(null);
    try {
      await api.deleteAccount({ password, anonymizeCertificates: anon });
      user.value = null;
      progress.value = null;
      navigate({ name: "menu" });
    } catch (err) {
      setError(errorMessage(err, t));
    }
  };

  return (
    <div class="profile">
      <Panel title={t("profile.title")}>
        <dl class="stats">
          <dt>{t("auth.name")}</dt><dd>{u.name}</dd>
          <dt>{t("profile.username")}</dt><dd>@{u.username}</dd>
          <dt>{t("auth.email")}</dt><dd>{u.email}</dd>
          <dt>{t("hub.level", { level: "" }).trim()}</dt><dd>{u.level} ({u.xp} XP)</dd>
          <dt>{t("profile.phasesDone")}</dt><dd>{done} / {phases.length}</dd>
          <dt>{t("profile.accuracy")}</dt><dd>{Math.round((prog?.terminalAccuracy ?? 0) * 100)}%</dd>
          <dt>{t("profile.activeTime")}</dt><dd>{formatHours(u.activeSeconds)}</dd>
          <dt>{t("badges.title")}</dt><dd>{u.badges.length}</dd>
        </dl>
        <p class="muted">{t("profile.memberSince", { date: new Date(u.createdAt).toLocaleDateString("pt-BR") })}</p>
      </Panel>
      <Panel title={t("avatar.change")} class="avatar-panel">
        <fieldset class="avatar-fieldset" disabled={avatarBusy}>
          <AvatarPicker value={u.avatar} onChange={(id) => void changeAvatar(id)} size={64} name="profile-avatar" />
        </fieldset>
        {avatarMsg && <p class="notice" role="status">{avatarMsg}</p>}
      </Panel>
      <Panel title={t("profile.deleteTitle")} class="danger-zone">
        <p>{t("profile.deleteText")}</p>
        {!confirm && <Button variant="danger" onClick={() => setConfirm(true)}>{t("profile.deleteAccount")}</Button>}
        {confirm && (
          <div class="stack">
            <label class="field-check"><input type="checkbox" checked={anon} onChange={(e) => setAnon((e.target as HTMLInputElement).checked)} /> {t("profile.deleteAnonymize")}</label>
            <label class="field">
              <span>{t("profile.deleteConfirm")}</span>
              <input type="password" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} autoComplete="current-password" />
            </label>
            {error && <p class="form-error" role="alert">{error}</p>}
            <div class="row">
              <Button variant="ghost" onClick={() => setConfirm(false)}>{t("app.cancel")}</Button>
              <Button variant="danger" disabled={!password} onClick={() => void del()}>{t("profile.deleteButton")}</Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
