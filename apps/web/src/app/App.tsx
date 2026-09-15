import { useEffect, useMemo } from "preact/hooks";
import { registry, curriculum } from "@fireshot/content";
import { api } from "../api/client";
import { ActiveTimeTracker, attachActivityListeners } from "../api/activeTime";
import { LocalBackend } from "../game/backend";
import { RemoteBackend } from "../game/remoteBackend";
import { t } from "../i18n/t";
import { GameScreen } from "../ui/game/GameScreen";
import { Hub } from "../ui/hub/Hub";
import { AuthScreen } from "../ui/screens/Auth";
import { LegalPage } from "../ui/screens/Legal";
import { MenuScreen } from "../ui/screens/Menu";
import { SettingsPanel } from "../ui/screens/Settings";
import { Button, Spinner } from "../ui/components/ui";
import { boot, booting, isLogged, navigate, refreshUser, route, user } from "./store";

const tracker = new ActiveTimeTracker({
  now: () => performance.now(),
  isVisible: () => document.visibilityState === "visible",
  send: (phaseId) => api.heartbeat({ phaseId, clientTs: new Date().toISOString() }),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
});

export function App() {
  useEffect(() => { void boot(); }, []);

  // tempo ativo: só com conta
  useEffect(() => {
    if (!isLogged.value) { tracker.stop(); return; }
    tracker.start();
    const detach = attachActivityListeners(tracker);
    return () => { detach(); tracker.stop(); };
  }, [isLogged.value]);

  const r = route.value;
  useEffect(() => {
    tracker.phaseId = r.name === "game" && !r.guest ? r.phaseId : null;
  }, [r]);

  const backend = useMemo(() => {
    if (r.name !== "game") return null;
    return r.guest || !user.value ? new LocalBackend() : new RemoteBackend();
  }, [r.name === "game" ? `${r.phaseId}:${r.nonce}:${r.guest}` : "none"]);

  if (booting.value) return <main class="page center"><Spinner label={t("app.loading")} /></main>;

  switch (r.name) {
    case "menu":
      return <MenuScreen />;
    case "auth":
      return <AuthScreen mode={r.mode} />;
    case "legal":
      return <LegalPage doc={r.doc} onBack={() => navigate(r.back)} />;
    case "settings":
      return (
        <main class="page">
          <Button variant="ghost" onClick={() => navigate(user.value ? { name: "hub", tab: "map" } : { name: "menu" })}>← {t("app.back")}</Button>
          <h1>{t("settings.title")}</h1>
          <SettingsPanel />
        </main>
      );
    case "hub":
      if (!user.value) { navigate({ name: "menu" }); return null; }
      return <Hub tab={r.tab} />;
    case "game": {
      const phases = curriculum();
      const idx = phases.findIndex((p) => p.id === r.phaseId);
      const next = idx >= 0 && idx < phases.length - 1 ? phases[idx + 1]! : null;
      const exit = (): void => {
        if (user.value && !r.guest) { void refreshUser(); navigate({ name: "hub", tab: "map" }); }
        else navigate({ name: "menu" });
      };
      return (
        <GameScreen
          key={`${r.phaseId}:${r.nonce}`}
          reg={registry}
          phaseId={r.phaseId}
          backend={backend!}
          onExit={exit}
          onRetry={() => navigate({ ...r, nonce: Date.now() })}
          onNext={next && !r.guest ? () => { void refreshUser(); navigate({ name: "game", phaseId: next.id, guest: false, nonce: Date.now() }); } : null}
        />
      );
    }
  }
}
