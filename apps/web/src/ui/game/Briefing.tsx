import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ContentRegistry, PhaseDef } from "@fireshot/sim";
import { t } from "../../i18n/t";
import { settings } from "../../app/settings";
import { Button, Overlay, ShapeIcon } from "../components/ui";

function speak(text: string): void {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.rate = 1.02;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("pt"));
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  } catch {
    /* sem síntese de voz: legendas continuam */
  }
}

/** Briefing com legendas (texto sempre visível) e narração opcional por síntese de voz. */
export function Briefing({ phase, reg, onStart, onQuit }: { phase: PhaseDef; reg: ContentRegistry; onStart: () => void; onQuit: () => void }) {
  const lines = phase.briefing.lines;
  const [idx, setIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const skipped = useRef(false);
  const s = settings.value;
  const line = lines[Math.min(idx, lines.length - 1)]!;
  const done = idx >= lines.length - 1 && chars >= line.text.length;

  useEffect(() => {
    if (skipped.current) {
      // "Pular" mostra a última fala inteira, sem digitá-la de novo
      skipped.current = false;
      setChars(line.text.length);
      return;
    }
    setChars(0);
    if (s.narration) speak(line.text);
    const speed = 28 / Math.max(0.25, s.captionSpeed);
    const timer = window.setInterval(() => {
      setChars((c) => {
        if (c >= line.text.length) { window.clearInterval(timer); return c; }
        return c + 1;
      });
    }, speed);
    return () => window.clearInterval(timer);
  }, [idx]);

  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        if (done) onStart();
        else next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const next = (): void => {
    if (chars < line.text.length) { setChars(line.text.length); return; }
    if (idx < lines.length - 1) setIdx(idx + 1);
  };

  const enemies = useMemo(() => (phase.introducesEnemies ?? []).map((id) => reg.enemies.find((e) => e.id === id)).filter(Boolean), [phase]);
  const weapons = useMemo(() => phase.weaponsAvailable.map((id) => reg.weapons.find((w) => w.id === id)).filter(Boolean), [phase]);

  return (
    <Overlay class="briefing" label={t("briefing.title")}>
      <div class="briefing-card">
        <div class="briefing-head">
          <span class="eyebrow">{t("briefing.title")} · {phase.order < 100 ? t("hub.phase", { n: phase.order }) : t("menu.lab")}</span>
          <h1>{phase.title}</h1>
          <p class="subtitle">{phase.subtitle}</p>
        </div>
        <div class="briefing-grid">
          <div>
            <h3>{t("briefing.objectives")}</h3>
            <ul class="objectives">{phase.learningObjectives.map((o) => <li key={o}>{o}</li>)}</ul>
            {enemies.length > 0 && (
              <>
                <h3>{t("hub.enemies")}</h3>
                <ul class="intro-list">
                  {enemies.map((e) => (
                    <li key={e!.id}>
                      <ShapeIcon shape={e!.shape} color={e!.color} size={34} />
                      <div><strong style={{ color: e!.color }}>{e!.name}</strong> <span class="muted">· {e!.concept}</span><br /><small>{e!.description}</small></div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div>
            <h3>{t("hub.weapons")}</h3>
            <ul class="intro-list">
              {weapons.map((w) => (
                <li key={w!.id}>
                  <span class="slot-key">{w!.slot}</span>
                  <div><strong style={{ color: w!.color }}>{w!.name}</strong><br /><small>{w!.description}</small></div>
                </li>
              ))}
            </ul>
            <p class="controls-hint">{t("briefing.controlsHint")}</p>
          </div>
        </div>
        <div class="caption" aria-live="polite">
          <span class="speaker">{line.speaker}</span>
          <p>{line.text.slice(0, chars)}<span class="caret" aria-hidden="true">▍</span></p>
          <span class="caption-progress">{idx + 1}/{lines.length}</span>
        </div>
        <div class="briefing-actions">
          <Button variant="ghost" onClick={onQuit}>{t("app.back")}</Button>
          {!done && <Button variant="ghost" onClick={() => { skipped.current = idx !== lines.length - 1; setIdx(lines.length - 1); setChars(lines[lines.length - 1]!.text.length); }}>{t("briefing.skip")}</Button>}
          {!done && <Button onClick={next}>{t("briefing.next")}</Button>}
          {done && <Button onClick={onStart} autoFocus>{t("briefing.start")}</Button>}
        </div>
      </div>
    </Overlay>
  );
}
