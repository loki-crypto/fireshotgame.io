import { signal, effect } from "@preact/signals";

export const ACTIONS = [
  "forward", "back", "left", "right", "jump", "sprint", "fire", "aim", "reload", "interact", "report", "backup",
  "weapon1", "weapon2", "weapon3", "weapon4", "weapon5", "pause",
] as const;
export type Action = (typeof ACTIONS)[number];

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  fire: ["Mouse0"],
  aim: ["Mouse2"],
  reload: ["KeyR"],
  interact: ["KeyE"],
  report: ["KeyF"],
  backup: ["KeyB"],
  weapon1: ["Digit1"],
  weapon2: ["Digit2"],
  weapon3: ["Digit3"],
  weapon4: ["Digit4"],
  weapon5: ["Digit5"],
  pause: ["KeyP"],
};

export interface Settings {
  sensitivity: number;
  /** sensibilidade aplicada enquanto mira (mira apurada pede mão mais leve) */
  aimSensitivity: number;
  /** mira alterna com um toque em vez de segurar o botão */
  toggleAim: boolean;
  invertY: boolean;
  fov: number;
  volume: number;
  quality: "low" | "high";
  reduceMotion: boolean;
  narration: boolean;
  captionSpeed: number;
  showFps: boolean;
  bindings: Record<Action, string[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  aimSensitivity: 0.65,
  toggleAim: false,
  invertY: false,
  fov: 75,
  volume: 0.7,
  quality: "high",
  reduceMotion: false,
  narration: false,
  captionSpeed: 1,
  showFps: false,
  bindings: DEFAULT_BINDINGS,
};

const KEY = "fireshot.settings.v1";

export function loadSettings(storage: Pick<Storage, "getItem"> | null = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      bindings: { ...DEFAULT_BINDINGS, ...(parsed.bindings ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export const settings = signal<Settings>(loadSettings());

effect(() => {
  const s = settings.value;
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível: mantém em memória */
  }
});

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
}

/** Atribui um código a uma ação, removendo-o de outras ações para evitar conflito. */
export function rebind(bindings: Record<Action, string[]>, action: Action, code: string, slot = 0): Record<Action, string[]> {
  const next = Object.fromEntries(
    Object.entries(bindings).map(([a, codes]) => [a, codes.filter((c) => c !== code)]),
  ) as Record<Action, string[]>;
  const list = [...(next[action] ?? [])];
  list[slot] = code;
  next[action] = list.filter(Boolean);
  return next;
}

export function keyLabel(code: string): string {
  if (code === "Mouse0") return "Botão esquerdo";
  if (code === "Mouse1") return "Botão do meio";
  if (code === "Mouse2") return "Botão direito";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = {
    Space: "Espaço", ShiftLeft: "Shift esq.", ShiftRight: "Shift dir.", ControlLeft: "Ctrl esq.", ControlRight: "Ctrl dir.",
    AltLeft: "Alt esq.", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Tab: "Tab", Enter: "Enter",
    Backquote: "`", CapsLock: "Caps Lock",
  };
  return map[code] ?? code;
}
