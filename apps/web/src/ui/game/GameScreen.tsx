import { useEffect, useRef, useState } from "preact/hooks";
import type { ContentRegistry } from "@fireshot/sim";
import { GameSession } from "../../game/GameSession";
import type { SessionBackend } from "../../game/backend";
import { settings } from "../../app/settings";
import { t } from "../../i18n/t";
import { Button, Overlay, Spinner } from "../components/ui";
import { Briefing } from "./Briefing";
import { PauseMenu } from "./PauseMenu";
import { DeathScreen } from "./DeathScreen";
import { TerminalView } from "./TerminalView";
import { Debrief } from "./Debrief";

export interface GameScreenProps {
  reg: ContentRegistry;
  phaseId: string;
  backend: SessionBackend;
  onExit: (reason: "quit" | "complete") => void;
  onRetry: () => void;
  onNext: (() => void) | null;
}

export function GameScreen({ reg, phaseId, backend, onExit, onRetry, onNext }: GameScreenProps) {
  const host = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<GameSession | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const s = new GameSession({ container: host.current, reg, phaseId, backend, settings: () => settings.value });
    setSession(s);
    void s.init();
    if (import.meta.env.VITE_E2E === "1") (window as unknown as { __fireshot?: unknown }).__fireshot = s.debugApi();
    return () => s.dispose();
  }, [phaseId, backend]);

  const mode = session?.mode.value ?? "loading";
  const world = session && mode !== "loading" && mode !== "error" ? session.world : null;

  return (
    <div class="game-screen" ref={host}>
      {mode === "loading" && <Overlay label={t("app.loading")}><Spinner label={t("app.loading")} /></Overlay>}
      {mode === "error" && (
        <Overlay label={t("app.error")}>
          <div class="pause-card">
            <h1>{t("app.error")}</h1>
            <p>{session?.error.value}</p>
            <Button onClick={() => onExit("quit")}>{t("app.back")}</Button>
          </div>
        </Overlay>
      )}
      {session && world && mode === "briefing" && <Briefing phase={world.phase} reg={reg} onStart={() => session.beginPlay()} onQuit={() => onExit("quit")} />}
      {session && mode === "playing" && !session.pointerLocked.value && (
        <button type="button" class="click-to-play" onClick={() => session.requestLock()}>{t("hud.clickToPlay")}</button>
      )}
      {session && mode === "paused" && <PauseMenu onResume={() => session.resume()} onCheckpoint={() => session.restartFromCheckpoint()} onQuit={() => onExit("quit")} />}
      {session && mode === "dead" && session.death.value && <DeathScreen death={session.death.value} onRespawn={() => session.respawn()} onQuit={() => onExit("quit")} />}
      {session && mode === "terminal" && session.terminal.value && (
        <TerminalView st={session.terminal.value} onSubmit={(a) => session.submitAnswer(a)} onContinue={() => session.continueTerminal()} onClose={() => session.closeTerminal()} />
      )}
      {session && world && mode === "debrief" && session.debrief.value && (
        <Debrief phase={world.phase} st={session.debrief.value} online={backend.online} onHub={() => onExit("complete")} onRetry={onRetry} onNext={onNext} onRetrySend={() => session.retryComplete()} />
      )}
    </div>
  );
}
