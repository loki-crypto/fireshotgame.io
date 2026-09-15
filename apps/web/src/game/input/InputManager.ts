import { emptyInput, type PlayerInput } from "@fireshot/sim";
import type { Action, Settings } from "../../app/settings";

const LOOK_SCALE = 0.0022;
/** Deltas maiores que isto num único evento são saltos espúrios do navegador, não movimento real. */
export const MAX_LOOK_DELTA = 280;
/** Ignora o movimento logo após capturar o ponteiro (o Chromium reporta um salto no primeiro evento). */
export const LOCK_SETTLE_MS = 120;

/** Converte teclado/mouse em PlayerInput respeitando o mapeamento de teclas configurado. */
export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private wheel = 0;
  private lockedAt = -Infinity;
  yaw = 0;
  pitch = 0;
  lastInputAt = 0;
  enabled = true;
  locked = false;

  constructor(private getSettings: () => Settings, private now: () => number = () => performance.now()) {}

  setLocked(locked: boolean): void {
    if (locked && !this.locked) this.lockedAt = this.now();
    this.locked = locked;
  }

  private codes(action: Action): string[] {
    return this.getSettings().bindings[action] ?? [];
  }

  isHeld(action: Action): boolean {
    return this.codes(action).some((c) => this.down.has(c));
  }

  /** Consome a borda de pressionamento (true uma única vez por toque). */
  consume(action: Action): boolean {
    let hit = false;
    for (const c of this.codes(action)) {
      if (this.pressed.has(c)) {
        this.pressed.delete(c);
        hit = true;
      }
    }
    return hit;
  }

  peek(action: Action): boolean {
    return this.codes(action).some((c) => this.pressed.has(c));
  }

  keyDown(code: string): void {
    this.lastInputAt = this.now();
    if (!this.enabled) return;
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }

  keyUp(code: string): void {
    this.lastInputAt = this.now();
    this.down.delete(code);
  }

  mouseMove(dx: number, dy: number): void {
    this.lastInputAt = this.now();
    if (!this.enabled || !this.locked) return;
    if (this.now() - this.lockedAt < LOCK_SETTLE_MS) return;
    if (Math.abs(dx) > MAX_LOOK_DELTA || Math.abs(dy) > MAX_LOOK_DELTA) return;
    const s = this.getSettings();
    const k = LOOK_SCALE * s.sensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (s.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    if (this.yaw > Math.PI * 4 || this.yaw < -Math.PI * 4) this.yaw %= Math.PI * 2;
  }

  wheelMove(delta: number): void {
    this.lastInputAt = this.now();
    if (!this.enabled) return;
    this.wheel += Math.sign(delta);
  }

  /** Solta tudo (ex.: ao pausar ou abrir terminal) para evitar teclas "presas". */
  releaseAll(): void {
    this.down.clear();
    this.pressed.clear();
    this.wheel = 0;
  }

  /** Monta a entrada do próximo passo da simulação e consome as bordas. */
  build(): PlayerInput {
    const inp = emptyInput();
    inp.yaw = this.yaw;
    inp.pitch = this.pitch;
    if (!this.enabled) return inp;
    inp.forward = (this.isHeld("forward") ? 1 : 0) - (this.isHeld("back") ? 1 : 0);
    inp.strafe = (this.isHeld("right") ? 1 : 0) - (this.isHeld("left") ? 1 : 0);
    inp.jump = this.isHeld("jump");
    inp.sprint = this.isHeld("sprint");
    inp.fire = this.locked && this.isHeld("fire");
    inp.reload = this.consume("reload");
    inp.report = this.consume("report");
    inp.backup = this.consume("backup");
    for (let i = 1; i <= 5; i++) if (this.consume(`weapon${i}` as Action)) inp.weaponSlot = i;
    if (this.wheel !== 0) {
      inp.weaponCycle = this.wheel > 0 ? 1 : -1;
      this.wheel = 0;
    }
    return inp;
  }
}

/** Liga eventos do DOM ao InputManager. Retorna função de desligamento. */
export function attachInput(input: InputManager, target: HTMLElement): () => void {
  const isTyping = (e: Event): boolean => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTyping(e)) return;
    if (input.enabled && ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    if (!e.repeat) input.keyDown(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => input.keyUp(e.code);
  const onMouseDown = (e: MouseEvent): void => input.keyDown(`Mouse${e.button}`);
  const onMouseUp = (e: MouseEvent): void => input.keyUp(`Mouse${e.button}`);
  const onMove = (e: MouseEvent): void => input.mouseMove(e.movementX || 0, e.movementY || 0);
  const onWheel = (e: WheelEvent): void => { if (input.locked) input.wheelMove(e.deltaY); };
  const onBlur = (): void => input.releaseAll();
  const onContext = (e: Event): void => { if (input.locked) e.preventDefault(); };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  target.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mousemove", onMove);
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("blur", onBlur);
  window.addEventListener("contextmenu", onContext);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mousemove", onMove);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("contextmenu", onContext);
  };
}
