/**
 * Efeitos sonoros sintetizados com Web Audio API (nenhum arquivo de áudio).
 * Cada som é uma pequena receita de osciladores, ruído, filtros e envelopes.
 */
export type SoundName =
  | "pistol" | "cannon" | "beam" | "scanner" | "shieldHum" | "shieldBlock" | "reload" | "dry" | "switch"
  | "hit" | "hitStrong" | "hitWeak" | "kill" | "hurt" | "death" | "pickup" | "trap" | "terminalOk" | "terminalFail"
  | "door" | "replicate" | "alarm" | "inbox" | "jump" | "step" | "explosion" | "spawn" | "blocked" | "enemyShot"
  | "checkpoint" | "reveal" | "lockout" | "encrypt" | "decrypt" | "exit" | "uiClick" | "uiHover"
  | "aimIn" | "aimOut";

export interface Listener {
  x: number;
  z: number;
  yaw: number;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private lastPlayed = new Map<SoundName, number>();
  listener: Listener = { x: 0, z: 0, yaw: 0 };

  /** Deve ser chamado a partir de um gesto do usuário (política de autoplay dos navegadores). */
  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 2147483647) * 2 - 1;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  suspend(): void { if (this.ctx?.state === "running") void this.ctx.suspend(); }
  resume(): void { if (this.ctx?.state === "suspended") void this.ctx.resume(); }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }

  /** Toca um som; `at` aplica atenuação por distância e panorâmica estéreo relativa ao ouvinte. */
  play(name: SoundName, at?: { x: number; z: number }, gainMul = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== "running") return;
    const nowMs = performance.now();
    const minGap = name === "hit" || name === "beam" || name === "step" || name === "enemyShot" ? 45 : 12;
    if (nowMs - (this.lastPlayed.get(name) ?? 0) < minGap) return;
    this.lastPlayed.set(name, nowMs);

    const out = ctx.createGain();
    let gain = gainMul;
    const panner = ctx.createStereoPanner();
    if (at) {
      const dx = at.x - this.listener.x, dz = at.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      gain *= 1 / (1 + d * 0.09);
      if (d > 0.01) {
        const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
        panner.pan.value = Math.max(-0.9, Math.min(0.9, (dx * rx + dz * rz) / d));
      }
    }
    if (gain < 0.02) return;
    out.gain.value = gain;
    out.connect(panner).connect(this.master);
    this.recipe(name, ctx, out, ctx.currentTime);
  }

  private osc(ctx: AudioContext, dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.003): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(ctx: AudioContext, dest: AudioNode, t: number, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bf = ctx.createBiquadFilter();
    bf.type = filter;
    bf.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    bf.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bf).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private recipe(name: SoundName, ctx: AudioContext, o: AudioNode, t: number): void {
    switch (name) {
      case "pistol":
        this.burst(ctx, o, t, 0.09, 0.5, "bandpass", 2400, 700, 0.8);
        this.osc(ctx, o, t, "square", 880, 160, 0.08, 0.18);
        break;
      case "cannon":
        this.osc(ctx, o, t, "sine", 150, 38, 0.4, 0.7);
        this.burst(ctx, o, t, 0.35, 0.5, "lowpass", 1400, 120);
        break;
      case "beam":
        this.osc(ctx, o, t, "sawtooth", 720, 640, 0.05, 0.07);
        break;
      case "scanner":
        this.osc(ctx, o, t, "sine", 260, 1500, 0.45, 0.28, 0.02);
        this.osc(ctx, o, t + 0.42, "sine", 1800, 1800, 0.25, 0.12);
        break;
      case "aimIn":
        // dois cliques mecânicos curtos: a arma encostando no ombro
        this.osc(ctx, o, t, "triangle", 520, 880, 0.05, 0.05);
        this.burst(ctx, o, t, 0.03, 0.18, "highpass", 2600, 2600);
        break;
      case "aimOut":
        this.osc(ctx, o, t, "triangle", 760, 430, 0.06, 0.04);
        break;
      case "shieldHum":
        this.osc(ctx, o, t, "triangle", 170, 185, 0.18, 0.06, 0.03);
        break;
      case "shieldBlock":
        this.osc(ctx, o, t, "sine", 1250, 1100, 0.18, 0.25);
        this.osc(ctx, o, t, "sine", 1870, 1700, 0.15, 0.12);
        break;
      case "reload":
        this.burst(ctx, o, t, 0.04, 0.35, "highpass", 3000);
        this.burst(ctx, o, t + 0.16, 0.05, 0.35, "highpass", 2200);
        break;
      case "dry":
        this.burst(ctx, o, t, 0.03, 0.3, "highpass", 4000);
        break;
      case "switch":
        this.osc(ctx, o, t, "square", 420, 520, 0.05, 0.06);
        break;
      case "hit":
        this.osc(ctx, o, t, "sine", 1600, 1500, 0.035, 0.18);
        break;
      case "hitStrong":
        this.osc(ctx, o, t, "sine", 1800, 1800, 0.04, 0.22);
        this.osc(ctx, o, t + 0.05, "sine", 2400, 2400, 0.05, 0.18);
        break;
      case "hitWeak":
        this.osc(ctx, o, t, "triangle", 260, 200, 0.07, 0.2);
        break;
      case "kill":
        this.osc(ctx, o, t, "square", 620, 70, 0.28, 0.2);
        this.burst(ctx, o, t, 0.2, 0.3, "bandpass", 1800, 300, 1.2);
        break;
      case "hurt":
        this.osc(ctx, o, t, "sine", 110, 60, 0.18, 0.5);
        this.burst(ctx, o, t, 0.12, 0.25, "lowpass", 900, 200);
        break;
      case "death":
        this.osc(ctx, o, t, "sawtooth", 440, 40, 1.2, 0.3, 0.01);
        this.burst(ctx, o, t, 0.8, 0.25, "lowpass", 2000, 80);
        break;
      case "pickup":
        this.osc(ctx, o, t, "sine", 660, 660, 0.08, 0.2);
        this.osc(ctx, o, t + 0.07, "sine", 880, 880, 0.08, 0.2);
        this.osc(ctx, o, t + 0.14, "sine", 1320, 1320, 0.12, 0.18);
        break;
      case "trap":
        this.osc(ctx, o, t, "sawtooth", 180, 120, 0.4, 0.3);
        this.osc(ctx, o, t, "sawtooth", 191, 127, 0.4, 0.3);
        break;
      case "terminalOk":
        this.osc(ctx, o, t, "sine", 660, 660, 0.15, 0.25);
        this.osc(ctx, o, t + 0.12, "sine", 990, 990, 0.3, 0.25);
        break;
      case "terminalFail":
        this.osc(ctx, o, t, "square", 160, 140, 0.3, 0.18);
        break;
      case "door":
        this.burst(ctx, o, t, 0.6, 0.35, "bandpass", 300, 1800, 2);
        break;
      case "replicate":
        this.osc(ctx, o, t, "sine", 300, 900, 0.15, 0.2);
        this.osc(ctx, o, t + 0.12, "sine", 300, 900, 0.15, 0.2);
        break;
      case "alarm":
        for (let i = 0; i < 3; i++) {
          this.osc(ctx, o, t + i * 0.3, "square", 740, 740, 0.14, 0.12);
          this.osc(ctx, o, t + i * 0.3 + 0.15, "square", 520, 520, 0.14, 0.12);
        }
        break;
      case "inbox":
        this.osc(ctx, o, t, "sine", 1046, 1046, 0.1, 0.16);
        this.osc(ctx, o, t + 0.1, "sine", 1318, 1318, 0.16, 0.14);
        break;
      case "jump":
        this.burst(ctx, o, t, 0.08, 0.12, "lowpass", 600);
        break;
      case "step":
        this.burst(ctx, o, t, 0.05, 0.08, "lowpass", 500 + Math.random() * 300);
        break;
      case "explosion":
        this.burst(ctx, o, t, 0.7, 0.8, "lowpass", 2400, 60);
        this.osc(ctx, o, t, "sine", 90, 30, 0.5, 0.6);
        break;
      case "spawn":
        this.osc(ctx, o, t, "triangle", 200, 800, 0.3, 0.14);
        break;
      case "blocked":
        this.osc(ctx, o, t, "square", 300, 300, 0.08, 0.12);
        this.osc(ctx, o, t + 0.1, "square", 220, 220, 0.12, 0.12);
        break;
      case "enemyShot":
        this.osc(ctx, o, t, "sawtooth", 520, 300, 0.12, 0.1);
        break;
      case "checkpoint":
        this.osc(ctx, o, t, "sine", 523, 523, 0.12, 0.18);
        this.osc(ctx, o, t + 0.1, "sine", 784, 784, 0.25, 0.18);
        break;
      case "reveal":
        this.osc(ctx, o, t, "triangle", 900, 400, 0.25, 0.2);
        break;
      case "lockout":
        this.osc(ctx, o, t, "square", 880, 880, 0.08, 0.14);
        this.osc(ctx, o, t + 0.1, "square", 880, 880, 0.08, 0.14);
        this.osc(ctx, o, t + 0.2, "square", 1320, 1320, 0.2, 0.14);
        break;
      case "encrypt":
        this.osc(ctx, o, t, "sawtooth", 1200, 90, 0.9, 0.3);
        this.burst(ctx, o, t, 0.9, 0.3, "bandpass", 4000, 300, 3);
        break;
      case "decrypt":
        this.osc(ctx, o, t, "sine", 300, 1400, 0.5, 0.25);
        break;
      case "exit":
        this.osc(ctx, o, t, "sine", 523, 523, 0.2, 0.2);
        this.osc(ctx, o, t + 0.15, "sine", 659, 659, 0.2, 0.2);
        this.osc(ctx, o, t + 0.3, "sine", 784, 784, 0.4, 0.2);
        break;
      case "uiClick":
        this.osc(ctx, o, t, "sine", 900, 700, 0.05, 0.08);
        break;
      case "uiHover":
        this.osc(ctx, o, t, "sine", 1400, 1400, 0.02, 0.03);
        break;
    }
  }
}

export const sfx = new Sfx();
