/**
 * Rastreador de tempo ATIVO (não "tempo online"):
 * envia heartbeat a cada 30 s somente se a aba está visível e houve input nos últimos 60 s.
 * O servidor soma os intervalos válidos, descarta lacunas > 90 s e limita cada crédito a 30 s.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const INPUT_WINDOW_MS = 60_000;

export interface ActiveTimeDeps {
  now: () => number;
  isVisible: () => boolean;
  send: (phaseId: string | null) => Promise<void>;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

export class ActiveTimeTracker {
  private lastInput = -Infinity;
  private timer: number | null = null;
  phaseId: string | null = null;
  sent = 0;

  constructor(private deps: ActiveTimeDeps) {}

  markInput(): void {
    this.lastInput = this.deps.now();
  }

  shouldSend(): boolean {
    return this.deps.isVisible() && this.deps.now() - this.lastInput <= INPUT_WINDOW_MS;
  }

  tick(): void {
    if (!this.shouldSend()) return;
    this.sent++;
    this.deps.send(this.phaseId).catch(() => { /* heartbeat perdido: servidor trata a lacuna */ });
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = this.deps.setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) this.deps.clearInterval(this.timer);
    this.timer = null;
  }
}

export function attachActivityListeners(tracker: ActiveTimeTracker): () => void {
  let lastMark = 0;
  const mark = (): void => {
    const now = performance.now();
    if (now - lastMark > 1000) { lastMark = now; tracker.markInput(); }
  };
  const events = ["keydown", "mousedown", "mousemove", "wheel", "touchstart"] as const;
  events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
  return () => events.forEach((e) => window.removeEventListener(e, mark));
}
