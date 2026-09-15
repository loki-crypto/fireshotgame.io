import { useState } from "preact/hooks";
import { t } from "../../i18n/t";
import { Button, Overlay } from "../components/ui";
import { SettingsPanel } from "../screens/Settings";

export function PauseMenu({ onResume, onCheckpoint, onQuit }: { onResume: () => void; onCheckpoint: () => void; onQuit: () => void }) {
  const [view, setView] = useState<"main" | "settings" | "confirm">("main");
  return (
    <Overlay class="pause" label={t("pause.title")}>
      <div class="pause-card">
        {view === "main" && (
          <>
            <h1>{t("pause.title")}</h1>
            <div class="stack">
              <Button onClick={onResume} autoFocus>{t("pause.resume")}</Button>
              <Button variant="ghost" onClick={onCheckpoint}>{t("pause.restartCheckpoint")}</Button>
              <Button variant="ghost" onClick={() => setView("settings")}>{t("pause.settings")}</Button>
              <Button variant="danger" onClick={() => setView("confirm")}>{t("pause.quit")}</Button>
            </div>
            <p class="controls-hint">{t("briefing.controlsHint")}</p>
          </>
        )}
        {view === "settings" && (
          <>
            <SettingsPanel compact />
            <Button onClick={() => setView("main")}>{t("app.back")}</Button>
          </>
        )}
        {view === "confirm" && (
          <>
            <p>{t("pause.quitConfirm")}</p>
            <div class="row">
              <Button variant="ghost" onClick={() => setView("main")}>{t("app.cancel")}</Button>
              <Button variant="danger" onClick={onQuit}>{t("pause.quit")}</Button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
