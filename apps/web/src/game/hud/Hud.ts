import {
  currentObjective, findWeaponDef, isAmmoWeapon, terminalAccess, type SimEvent, type World,
} from "@fireshot/sim";
import { t, formatTime } from "../../i18n/t";
import { keyLabel, type Settings } from "../../app/settings";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Atualiza texto/estilo apenas quando muda (evita layout desnecessário a cada quadro). */
class Bind {
  private last = new WeakMap<HTMLElement, string>();
  text(e: HTMLElement, v: string): void {
    if (this.last.get(e) !== v) { e.textContent = v; this.last.set(e, v); }
  }
  style(e: HTMLElement, prop: "width" | "transform" | "opacity" | "display", v: string): void {
    const key = `${prop}:${v}`;
    if (this.last.get(e) !== key) { e.style[prop] = v; this.last.set(e, key); }
  }
  cls(e: HTMLElement, cls: string, on: boolean): void {
    if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
  }
}

const TOAST_LIMIT = 4;

export class Hud {
  readonly root: HTMLDivElement;
  private b = new Bind();
  private cross!: HTMLElement;
  private aimVignette!: HTMLElement;
  private objective: HTMLDivElement;
  private timer: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpText: HTMLDivElement;
  private shieldFill: HTMLDivElement;
  private shieldText: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private weaponName: HTMLDivElement;
  private ammo: HTMLDivElement;
  private energyWrap: HTMLDivElement;
  private energyFill: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private bytes: HTMLDivElement;
  private prompt: HTMLDivElement;
  private chips: HTMLDivElement;
  private toasts: HTMLDivElement;
  private hitmark: HTMLDivElement;
  private dmgDir: HTMLDivElement;
  private vignette: HTMLDivElement;
  private inbox: HTMLDivElement;
  private inboxKey = "";
  private radar: HTMLCanvasElement;
  private fps: HTMLDivElement;
  private hitTimer = 0;
  private dmgTimer = 0;
  private vignetteTimer = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsValue = 0;
  readonly floatLayer: HTMLDivElement;

  constructor(container: HTMLElement, private settings: () => Settings) {
    this.root = el("div", "hud", container);
    this.floatLayer = el("div", "hud-float", this.root);
    this.vignette = el("div", "hud-vignette", this.root);
    const top = el("div", "hud-top", this.root);
    this.objective = el("div", "hud-objective", top);
    this.timer = el("div", "hud-timer", top);
    this.fps = el("div", "hud-fps", this.root);

    this.cross = el("div", "hud-crosshair", this.root);
    for (let i = 0; i < 4; i++) el("span", `ch ch-${i}`, this.cross);
    el("span", "ch-dot", this.cross);
    this.aimVignette = el("div", "hud-aim", this.root);
    this.hitmark = el("div", "hud-hitmark", this.root);
    this.dmgDir = el("div", "hud-dmgdir", this.root);
    this.prompt = el("div", "hud-prompt", this.root);
    this.toasts = el("div", "hud-toasts", this.root);
    this.toasts.setAttribute("role", "status");
    this.toasts.setAttribute("aria-live", "polite");
    this.inbox = el("div", "hud-inbox", this.root);

    const vitals = el("div", "hud-vitals", this.root);
    const bar = (label: string, cls: string): [HTMLDivElement, HTMLDivElement] => {
      const row = el("div", `hud-bar ${cls}`, vitals);
      el("div", "hud-bar-label", row, label);
      const track = el("div", "hud-bar-track", row);
      const fill = el("div", "hud-bar-fill", track);
      const txt = el("div", "hud-bar-value", row);
      return [fill, txt];
    };
    [this.hpFill, this.hpText] = bar(t("hud.integrity"), "bar-hp");
    [this.shieldFill, this.shieldText] = bar(t("hud.shield"), "bar-shield");
    const st = el("div", "hud-stamina", vitals);
    this.staminaFill = el("div", "hud-stamina-fill", st);
    this.bytes = el("div", "hud-bytes", vitals);
    this.chips = el("div", "hud-chips", this.root);

    const weapon = el("div", "hud-weapon", this.root);
    this.weaponName = el("div", "hud-weapon-name", weapon);
    this.ammo = el("div", "hud-ammo", weapon);
    this.energyWrap = el("div", "hud-energy", weapon);
    this.energyFill = el("div", "hud-energy-fill", this.energyWrap);
    const slotRow = el("div", "hud-slots", weapon);
    for (let i = 1; i <= 5; i++) {
      const s = el("div", "hud-slot", slotRow);
      el("span", "hud-slot-n", s, String(i));
      el("span", "hud-slot-name", s, "");
      this.slots.push(s);
    }
    this.radar = el("canvas", "hud-radar", this.root);
    this.radar.width = 150;
    this.radar.height = 150;
  }

  toast(text: string, tone: "info" | "warn" | "success" | "danger" = "info"): void {
    const toast = el("div", `hud-toast tone-${tone}`, this.toasts, text);
    while (this.toasts.children.length > TOAST_LIMIT) this.toasts.firstElementChild?.remove();
    const life = Math.min(9000, 3500 + text.length * 45);
    window.setTimeout(() => toast.classList.add("out"), life);
    window.setTimeout(() => toast.remove(), life + 400);
  }

  handleEvents(w: World, events: readonly SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case "toast": this.toast(ev.text, ev.tone); break;
        case "enemy_hit":
          this.hitTimer = 0.15;
          this.hitmark.className = `hud-hitmark show hm-${ev.counter}`;
          break;
        case "enemy_killed":
          this.hitTimer = 0.3;
          this.hitmark.className = `hud-hitmark show hm-kill`;
          break;
        case "player_damaged": {
          this.vignetteTimer = 0.4;
          if (ev.from) {
            const p = w.player;
            const ang = Math.atan2(-(ev.from.x - p.pos.x), -(ev.from.z - p.pos.z)) - p.yaw;
            this.dmgDir.style.transform = `translate(-50%, -50%) rotate(${(-ang * 180) / Math.PI}deg)`;
            this.dmgTimer = 0.8;
          }
          break;
        }
        case "checkpoint":
          if (ev.reason !== "start") this.toast(ev.reason === "backup" ? "Backup salvo." : "Checkpoint salvo.", "success");
          break;
        default: break;
      }
    }
  }

  update(w: World, dt: number, elapsed: number, look: { yaw: number }): void {
    // mira apurada: cruz recolhe, ponto aparece e a vinheta escurece as bordas
    this.b.cls(this.cross, "aiming", w.player.aiming);
    this.b.cls(this.aimVignette, "on", w.player.aiming);
    const b = this.b;
    const s = this.settings();
    const p = w.player;

    const obj = currentObjective(w);
    b.text(this.objective, t(obj.key, obj.params));
    b.text(this.timer, `${formatTime(elapsed)} / ${formatTime(w.phase.parTime)}`);
    b.cls(this.timer, "over", elapsed > w.phase.parTime);

    b.style(this.hpFill, "width", `${Math.max(0, (p.hp / p.maxHp) * 100).toFixed(1)}%`);
    b.text(this.hpText, String(Math.ceil(p.hp)));
    b.cls(this.hpFill, "low", p.hp / p.maxHp < 0.3);
    b.style(this.shieldFill, "width", `${Math.max(0, (p.shield / Math.max(1, p.maxShield)) * 100).toFixed(1)}%`);
    b.text(this.shieldText, String(Math.ceil(p.shield)));
    b.style(this.staminaFill, "width", `${(p.stamina / p.maxStamina * 100).toFixed(1)}%`);
    b.cls(this.staminaFill, "exhausted", p.exhausted);
    b.text(this.bytes, t("hud.bytes", { n: w.sessionBytes }));

    const ws = p.weapons[p.active];
    if (ws) {
      const def = findWeaponDef(w.reg, ws.defId);
      b.text(this.weaponName, def.name);
      this.weaponName.style.color = def.color;
      if (isAmmoWeapon(def)) {
        b.text(this.ammo, ws.reloading ? t("hud.reloading") : `${ws.magazine} / ${ws.reserve === null ? t("hud.infinite") : ws.reserve}`);
        b.style(this.energyWrap, "display", "none");
      } else {
        b.text(this.ammo, t("hud.energy"));
        b.style(this.energyWrap, "display", "block");
        b.style(this.energyFill, "width", `${(ws.energy / def.energyMax * 100).toFixed(1)}%`);
      }
      b.cls(this.ammo, "locked", ws.locked);
    }
    for (let i = 0; i < 5; i++) {
      const slotEl = this.slots[i]!;
      const idx = p.weapons.findIndex((x) => findWeaponDef(w.reg, x.defId).slot === i + 1);
      const nameEl = slotEl.children[1] as HTMLElement;
      if (idx < 0) {
        b.cls(slotEl, "empty", true);
        b.text(nameEl, "");
        slotEl.title = t("hud.slotEmpty");
        continue;
      }
      const def = findWeaponDef(w.reg, p.weapons[idx]!.defId);
      b.cls(slotEl, "empty", false);
      b.cls(slotEl, "active", idx === p.active);
      b.cls(slotEl, "locked", p.weapons[idx]!.locked);
      b.text(nameEl, def.name);
      slotEl.style.setProperty("--slot-color", def.color);
    }

    // prompt de interação
    let prompt = "";
    if (w.focusTerminal && w.status === "playing") {
      const acc = terminalAccess(w, w.focusTerminal);
      const term = w.terminals.find((x) => x.id === w.focusTerminal)!;
      if (acc.ok) prompt = t("hud.interact", { key: keyLabel(s.bindings.interact[0] ?? "KeyE"), title: term.def.title });
      else if (acc.reason === "locked") prompt = t("hud.terminalLocked", { names: (acc.missing ?? []).map((id) => w.terminals.find((x) => x.id === id)?.def.title ?? id).join(", ") });
      else if (acc.reason === "corrupted") prompt = t("hud.terminalCorrupted");
      else if (acc.reason === "solved") prompt = t("hud.terminalSolved");
    }
    b.text(this.prompt, prompt);
    b.cls(this.prompt, "show", prompt !== "");

    // chips de estado (montados como texto: nada aqui vira HTML, nem o rótulo de tecla salvo nas configurações)
    const chips: [cls: string, text: string][] = [];
    if (w.vpnTunnelUntil > w.time) chips.push(["chip chip-vpn", t("hud.vpn")]);
    if (p.saturated) chips.push(["chip chip-danger", t("hud.saturated")]);
    if (w.encryptedUntil > w.time) chips.push(["chip chip-danger", t("hud.encrypted", { s: Math.ceil(w.encryptedUntil - w.time) })]);
    if (w.encryptWarnUntil > w.time) chips.push(["chip chip-warn blink", t("hud.encryptWarn")]);
    if (w.mods.backup && w.backupAvailable) chips.push(["chip", t("hud.backupReady", { key: keyLabel(s.bindings.backup[0] ?? "KeyB") })]);
    if (w.mods.mfa && w.mfaAvailable) chips.push(["chip chip-ok", t("hud.mfaReady")]);
    const chipKey = JSON.stringify(chips);
    if (this.chips.dataset.key !== chipKey) {
      this.chips.replaceChildren(...chips.map(([cls, text]) => el("span", cls, undefined, text)));
      this.chips.dataset.key = chipKey;
    }

    this.updateInbox(w, s);

    // marcador de acerto e indicador de dano
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    if (this.hitTimer <= 0 && this.hitmark.classList.contains("show")) this.hitmark.className = "hud-hitmark";
    this.dmgTimer = Math.max(0, this.dmgTimer - dt);
    b.style(this.dmgDir, "opacity", this.dmgTimer > 0 ? String(Math.min(1, this.dmgTimer * 2)) : "0");
    this.vignetteTimer = Math.max(0, this.vignetteTimer - dt);
    const lowHp = p.hp / p.maxHp < 0.3 ? 0.35 + 0.15 * Math.sin(w.time * 6) : 0;
    b.style(this.vignette, "opacity", Math.max(lowHp, this.vignetteTimer * 1.8).toFixed(2));

    // FPS
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fpsValue = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    b.style(this.fps, "display", s.showFps ? "block" : "none");
    if (s.showFps) b.text(this.fps, t("hud.fps", { fps: this.fpsValue }));

    b.style(this.radar, "display", w.mods.radar ? "block" : "none");
    if (w.mods.radar) this.drawRadar(w, look.yaw);
  }

  get fpsNow(): number { return this.fpsValue; }

  private updateInbox(w: World, s: Settings): void {
    const open = w.inbox.filter((m) => m.resolved === "open").slice(-3);
    const key = open.map((m) => m.id).join(",");
    if (key === this.inboxKey) return;
    this.inboxKey = key;
    this.inbox.replaceChildren();
    if (open.length === 0) return;
    el("div", "hud-inbox-title", this.inbox, t("hud.inboxTitle"));
    open.forEach((m, i) => {
      const card = el("div", `hud-mail ${m.kind === "ransom" ? "mail-ransom" : ""}`, this.inbox);
      el("div", "mail-from", card, m.from);
      el("div", "mail-subject", card, m.subject);
      el("div", "mail-body", card, m.body);
      if (i === open.length - 1) {
        const k = keyLabel(s.bindings.report[0] ?? "KeyF");
        el("div", "mail-action", card, m.kind === "ransom" ? t("hud.reportRansom", { key: k }) : t("hud.report", { key: k }));
      }
    });
  }

  private drawRadar(w: World, yaw: number): void {
    const ctx = this.radar.getContext("2d");
    if (!ctx) return;
    const size = 150, c = size / 2, range = 26, scale = (c - 6) / range;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(4, 12, 20, 0.7)";
    ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(57, 208, 255, 0.5)";
    ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, (c - 2) / 2, 0, Math.PI * 2); ctx.stroke();
    const p = w.player.pos;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const toRadar = (x: number, z: number): [number, number] => {
      const dx = x - p.x, dz = z - p.z;
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      return [c + rx * scale, c + rz * scale];
    };
    for (const term of w.terminals) {
      const [x, y] = toRadar(term.pos.x, term.pos.z);
      if (Math.hypot(x - c, y - c) > c - 4) continue;
      ctx.fillStyle = term.solved ? "#3dff8a" : "#39d0ff";
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    for (const e of w.enemies) {
      if (!e.alive || e.disguised || e.statuses.has("hidden")) continue;
      const [x, y] = toRadar(e.pos.x, e.pos.z);
      if (Math.hypot(x - c, y - c) > c - 4) continue;
      ctx.fillStyle = e.def.color;
      ctx.beginPath(); ctx.arc(x, y, e.behavior === "ransomware" ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(c, c - 7); ctx.lineTo(c - 5, c + 5); ctx.lineTo(c + 5, c + 5); ctx.closePath(); ctx.fill();
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? "block" : "none";
  }

  dispose(): void {
    this.root.remove();
  }
}
