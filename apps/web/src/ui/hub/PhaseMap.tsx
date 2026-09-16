import { useState } from "preact/hooks";
import type { ContentRegistry, PhaseDef } from "@fireshot/sim";
import { curriculum } from "@fireshot/content";
import { t, formatTime } from "../../i18n/t";
import { navigate, progress } from "../../app/store";
import { Button, Panel, ShapeIcon } from "../components/ui";
import { DesktopNotice } from "../components/DesktopNotice";

export function PhaseMap({ reg }: { reg: ContentRegistry }) {
  const phases = curriculum();
  const prog = progress.value?.phases ?? [];
  const info = (p: PhaseDef) => prog.find((x) => x.phaseId === p.id);
  const firstOpen = phases.find((p) => info(p)?.unlocked && !info(p)?.completed) ?? phases[0]!;
  const [selected, setSelected] = useState<string>(firstOpen.id);
  const sel = phases.find((p) => p.id === selected) ?? phases[0]!;
  const selInfo = info(sel);
  const done = phases.filter((p) => info(p)?.completed).length;

  // layout em serpentina: 5 nós por linha
  const perRow = 5, dx = 150, dy = 120;
  const pos = (i: number) => {
    const row = Math.floor(i / perRow);
    const col = row % 2 === 0 ? i % perRow : perRow - 1 - (i % perRow);
    return { x: 70 + col * dx, y: 60 + row * dy };
  };
  const rows = Math.ceil(phases.length / perRow);

  return (
    <div class="map-layout">
      <Panel title={t("hub.map")} actions={<span class="muted">{t("hub.progress", { done, total: phases.length })}</span>}>
        <svg class="phase-map" viewBox={`0 0 ${70 * 2 + dx * (perRow - 1)} ${60 * 2 + dy * (rows - 1)}`} role="list">
          {phases.slice(1).map((p, i) => {
            const a = pos(i), b = pos(i + 1);
            const lit = info(p)?.unlocked;
            return <line key={`l${p.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} class={`map-link ${lit ? "lit" : ""}`} />;
          })}
          {phases.map((p, i) => {
            const { x, y } = pos(i);
            const pi = info(p);
            const state = pi?.completed ? "done" : pi?.unlocked ? "open" : "locked";
            const accent = p.ambient?.accent ?? "#39d0ff";
            return (
              <g key={p.id} role="listitem" class={`map-node ${state} ${selected === p.id ? "selected" : ""}`} transform={`translate(${x},${y})`} tabIndex={0}
                onClick={() => setSelected(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(p.id); }}
                aria-label={`${t("hub.phase", { n: p.order })}: ${p.title} (${t(state === "done" ? "hub.completed" : state === "open" ? "hub.available" : "hub.locked")})`}>
                <circle r="34" class="node-ring" style={{ stroke: state === "locked" ? "#2a3a50" : accent }} />
                <circle r="26" class="node-core" style={{ fill: state === "done" ? accent : "#07101c", stroke: accent }} />
                <text y="7" text-anchor="middle" class="node-num" style={{ fill: state === "done" ? "#04060c" : state === "locked" ? "#3a4a60" : accent }}>{state === "locked" ? "🔒" : p.order}</text>
                <text y="54" text-anchor="middle" class="node-label">{p.title}</text>
              </g>
            );
          })}
        </svg>
      </Panel>
      <Panel title={<>{t("hub.phase", { n: sel.order })} · {sel.title}</>} class="phase-detail">
        <p class="subtitle">{sel.subtitle}</p>
        <div class="start-zone">
          <DesktopNotice compact />
          {selInfo?.unlocked ? (
            <Button class="btn-big btn-start" onClick={() => navigate({ name: "game", phaseId: sel.id, guest: false, nonce: Date.now() })}>
              <span aria-hidden="true">▶</span> {selInfo.completed ? t("hub.replay") : t("hub.start")}
            </Button>
          ) : (
            <p class="locked-note">🔒 {t("hub.lockedHint")}</p>
          )}
          {selInfo?.bestTimeS !== null && selInfo?.bestTimeS !== undefined && <p class="muted small">{t("hub.bestTime", { time: formatTime(selInfo.bestTimeS) })}</p>}
        </div>
        <div class="chips">{sel.concepts.map((c) => <span key={c} class="chip">{c}</span>)}</div>
        <h3>{t("hub.objectives")}</h3>
        <ul class="objectives">{sel.learningObjectives.map((o) => <li key={o}>{o}</li>)}</ul>
        {(sel.introducesEnemies ?? []).length > 0 && (
          <>
            <h3>{t("hub.enemies")}</h3>
            <div class="enemy-row">
              {(sel.introducesEnemies ?? []).map((id) => reg.enemies.find((e) => e.id === id)).filter(Boolean).map((e) => (
                <div key={e!.id} class="enemy-card" title={e!.description}>
                  <ShapeIcon shape={e!.shape} color={e!.color} size={40} />
                  <span>{e!.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <h3>{t("hub.weapons")}</h3>
        <div class="chips">{sel.weaponsAvailable.map((id) => reg.weapons.find((w) => w.id === id)).map((w) => <span key={w!.id} class="chip" style={{ borderColor: w!.color, color: w!.color }}>{w!.slot} · {w!.name}</span>)}</div>
        <div class="row">
          <Button variant="ghost" small onClick={() => navigate({ name: "game", phaseId: "lab", guest: false, nonce: Date.now() })}>{t("hub.practice")}</Button>
        </div>
      </Panel>
    </div>
  );
}
