import * as THREE from "three";
import { PALETTE } from "./palette";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  return [c, ctx];
}

function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

/** Ladrilho do piso: grade de rede com trilhas de "circuito". */
export function floorTexture(accent: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = PALETTE.floor;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = PALETTE.floorLine;
  g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.globalAlpha = 0.35;
  g.strokeStyle = accent;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, 64); g.lineTo(40, 64); g.lineTo(52, 52); g.lineTo(128, 52);
  g.moveTo(64, 0); g.lineTo(64, 30); g.lineTo(76, 42);
  g.stroke();
  g.fillStyle = accent;
  g.fillRect(38, 62, 4, 4);
  g.fillRect(74, 40, 4, 4);
  g.globalAlpha = 1;
  return tex(c, true);
}

export function ceilingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = PALETTE.ceiling;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#0b1422";
  g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 62);
  return tex(c, true);
}

/** Painel de parede com linhas e LEDs discretos. */
export function wallTexture(accent: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#0e1a2e");
  grad.addColorStop(1, "#070d18");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = PALETTE.wallLine;
  g.lineWidth = 2;
  g.strokeRect(4, 6, 120, 110);
  g.strokeRect(4, 128, 120, 120);
  g.globalAlpha = 0.5;
  g.fillStyle = accent;
  for (let i = 0; i < 4; i++) g.fillRect(12 + i * 9, 18, 5, 3);
  g.globalAlpha = 0.25;
  g.fillRect(0, 120, 128, 2);
  g.globalAlpha = 1;
  return tex(c);
}

export function doorTexture(color: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  g.fillStyle = "#12090d";
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = color;
  for (let y = -128; y < 384; y += 36) {
    g.beginPath();
    g.moveTo(0, y); g.lineTo(128, y + 64); g.lineTo(128, y + 80); g.lineTo(0, y + 16);
    g.closePath();
    g.globalAlpha = 0.55;
    g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 250);
  return tex(c);
}

export interface ScreenInfo {
  title: string;
  status: "available" | "locked" | "solved" | "corrupted";
  line?: string;
}

const STATUS_COLOR: Record<ScreenInfo["status"], string> = {
  available: PALETTE.accent,
  locked: PALETTE.locked,
  solved: PALETTE.ok,
  corrupted: PALETTE.corrupt,
};

/** Tela do terminal: título, estado e "código" decorativo. */
export function drawScreen(ctx: CanvasRenderingContext2D, info: ScreenInfo, seed: number): void {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const color = STATUS_COLOR[info.status];
  ctx.fillStyle = "#020608";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color;
  ctx.font = "14px monospace";
  let s = seed;
  for (let y = 60; y < h - 10; y += 16) {
    let line = "";
    for (let i = 0; i < 28; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      line += info.status === "corrupted" ? "<>'\";=#%$"[s % 10] : "0123456789abcdef"[s % 16];
    }
    ctx.fillText(line, 12, y);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = "bold 26px monospace";
  ctx.fillText(info.title.slice(0, 18), 12, 34);
  ctx.fillRect(12, 42, w - 24, 3);
  ctx.font = "bold 20px monospace";
  const label = info.line ?? { available: "[E] ACESSAR", locked: "BLOQUEADO", solved: "RESOLVIDO", corrupted: "CORROMPIDO" }[info.status];
  ctx.fillText(label, 12, h - 18);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
}

export function screenTexture(info: ScreenInfo, seed: number): { texture: THREE.CanvasTexture; ctx: CanvasRenderingContext2D } {
  const [c, g] = canvas(256, 160);
  drawScreen(g, info, seed);
  return { texture: tex(c), ctx: g };
}

/** Painel holográfico com texto quebrado em linhas. */
export function signTexture(text: string, color: string = PALETTE.accent): { texture: THREE.CanvasTexture; aspect: number } {
  const [c, g] = canvas(512, 256);
  g.fillStyle = "rgba(2, 10, 18, 0.72)";
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(2, 2, 508, 252);
  g.fillStyle = color;
  g.font = "bold 30px system-ui, sans-serif";
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (g.measureText(test).width > 470 && cur) { lines.push(cur); cur = word; } else cur = test;
  }
  if (cur) lines.push(cur);
  const lh = 38;
  const startY = 128 - ((lines.length - 1) * lh) / 2 + 10;
  lines.slice(0, 6).forEach((l, i) => g.fillText(l, 20, startY + i * lh));
  return { texture: tex(c), aspect: 2 };
}

export function labelTexture(text: string, color: string, bg = "rgba(0,0,0,0)"): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = color;
  g.font = "bold 36px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 34);
  return tex(c);
}

export function barrierTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  g.clearRect(0, 0, 64, 128);
  g.strokeStyle = "rgba(255,159,28,0.9)";
  g.lineWidth = 3;
  for (let y = 0; y < 128; y += 16) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 8); g.stroke();
  }
  g.strokeRect(1, 1, 62, 126);
  const t = tex(c, true);
  return t;
}

export function hexTexture(color: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = color;
  g.lineWidth = 2;
  const r = 14;
  for (let row = 0; row < 7; row++) for (let col = 0; col < 6; col++) {
    const cx = col * r * 1.75 + (row % 2) * r * 0.875;
    const cy = row * r * 1.5;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
  return tex(c, true);
}
