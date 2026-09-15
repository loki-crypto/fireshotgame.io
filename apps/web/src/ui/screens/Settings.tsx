import { useEffect, useState } from "preact/hooks";
import { ACTIONS, DEFAULT_SETTINGS, keyLabel, rebind, settings, updateSettings, type Action } from "../../app/settings";
import { sfx } from "../../game/audio/Sfx";
import { t } from "../../i18n/t";
import { Button, Panel } from "../components/ui";

function KeyBinder({ action }: { action: Action }) {
  const [listening, setListening] = useState<number | null>(null);
  const codes = settings.value.bindings[action] ?? [];
  useEffect(() => {
    if (listening === null) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") updateSettings({ bindings: rebind(settings.value.bindings, action, e.code, listening) });
      setListening(null);
    };
    const onMouse = (e: MouseEvent): void => {
      e.preventDefault();
      updateSettings({ bindings: rebind(settings.value.bindings, action, `Mouse${e.button}`, listening) });
      setListening(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    const id = window.setTimeout(() => window.addEventListener("mousedown", onMouse, { capture: true }), 50);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("mousedown", onMouse, { capture: true });
    };
  }, [listening]);
  return (
    <div class="binding-row">
      <span>{t(`settings.action.${action}`)}</span>
      <div class="binding-keys">
        {[0, 1].map((slot) => (
          <button key={slot} type="button" class={`key-btn ${listening === slot ? "listening" : ""}`} onClick={() => setListening(slot)} aria-label={`${t(`settings.action.${action}`)} ${slot + 1}`}>
            {listening === slot ? t("settings.pressKey") : codes[slot] ? keyLabel(codes[slot]!) : "—"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const s = settings.value;
  useEffect(() => { sfx.setVolume(s.volume); }, [s.volume]);
  return (
    <div class={`settings ${compact ? "compact" : ""}`}>
      <Panel title={t("settings.controls")}>
        <label class="field-range">
          <span>{t("settings.sensitivity")} <output>{s.sensitivity.toFixed(2)}×</output></span>
          <input type="range" min={0.2} max={3} step={0.05} value={s.sensitivity} onInput={(e) => updateSettings({ sensitivity: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <label class="field-check"><input type="checkbox" checked={s.invertY} onChange={(e) => updateSettings({ invertY: (e.target as HTMLInputElement).checked })} /> {t("settings.invertY")}</label>
        <label class="field-range">
          <span>{t("settings.fov")} <output>{s.fov}°</output></span>
          <input type="range" min={60} max={100} step={1} value={s.fov} onInput={(e) => updateSettings({ fov: Number((e.target as HTMLInputElement).value) })} />
        </label>
      </Panel>
      <Panel title={t("settings.audio")}>
        <label class="field-range">
          <span>{t("settings.volume")} <output>{Math.round(s.volume * 100)}%</output></span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onInput={(e) => updateSettings({ volume: Number((e.target as HTMLInputElement).value) })} />
        </label>
      </Panel>
      <Panel title={t("settings.video")}>
        <div class="segmented" role="radiogroup" aria-label={t("settings.quality")}>
          <button type="button" role="radio" aria-checked={s.quality === "high"} class={`seg ${s.quality === "high" ? "sel" : ""}`} onClick={() => updateSettings({ quality: "high" })}>{t("settings.qualityHigh")}</button>
          <button type="button" role="radio" aria-checked={s.quality === "low"} class={`seg ${s.quality === "low" ? "sel" : ""}`} onClick={() => updateSettings({ quality: "low" })}>{t("settings.qualityLow")}</button>
        </div>
        <label class="field-check"><input type="checkbox" checked={s.showFps} onChange={(e) => updateSettings({ showFps: (e.target as HTMLInputElement).checked })} /> {t("settings.showFps")}</label>
      </Panel>
      <Panel title={t("settings.accessibility")}>
        <label class="field-check"><input type="checkbox" checked={s.reduceMotion} onChange={(e) => updateSettings({ reduceMotion: (e.target as HTMLInputElement).checked })} /> {t("settings.reduceMotion")}</label>
        <label class="field-check"><input type="checkbox" checked={s.narration} onChange={(e) => updateSettings({ narration: (e.target as HTMLInputElement).checked })} /> {t("settings.narration")}</label>
        <label class="field-range">
          <span>{t("settings.captionSpeed")} <output>{s.captionSpeed.toFixed(1)}×</output></span>
          <input type="range" min={0.5} max={2} step={0.1} value={s.captionSpeed} onInput={(e) => updateSettings({ captionSpeed: Number((e.target as HTMLInputElement).value) })} />
        </label>
      </Panel>
      <Panel title={t("settings.keys")} actions={<Button small variant="ghost" onClick={() => updateSettings({ bindings: DEFAULT_SETTINGS.bindings })}>{t("settings.reset")}</Button>}>
        <div class="bindings">{ACTIONS.map((a) => <KeyBinder key={a} action={a} />)}</div>
      </Panel>
    </div>
  );
}
