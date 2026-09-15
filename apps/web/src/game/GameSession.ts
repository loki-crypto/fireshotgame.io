import { signal } from "@preact/signals";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import * as THREE from "three";
import {
  FIXED_DT, applyEffects, applyTerminalResult, checkAnswer, createWorld, damagePlayer, findWeaponDef, generateQuestion, killEnemy, mulberry32, openDoor,
  phaseSummary, questionSeed, respawn, stepWorld, tamperQuestion, terminalAccess,
  type AnswerValue, type CheckResult, type ContentRegistry, type EnemyDef, type PhaseSummary, type Question, type RulesAnswer, type SimEvent,
  type Tampered, type World,
} from "@fireshot/sim";
import type { Settings } from "../app/settings";
import { t } from "../i18n/t";
import { attachInput, InputManager } from "./input/InputManager";
import { Renderer } from "./render/Renderer";
import { Hud } from "./hud/Hud";
import { sfx, type SoundName } from "./audio/Sfx";
import type { AnswerRequest, BadgeAward, CompleteResult, SessionBackend, TimedEvent } from "./backend";
import { createMessageFactory } from "./messages";

export type GameMode = "loading" | "briefing" | "playing" | "paused" | "terminal" | "dead" | "debrief" | "error";

export interface TerminalResultState {
  correct: boolean;
  items: CheckResult["items"];
  explanation: string;
  tamperNote: string | null;
  solvedTerminal: boolean;
  xpDelta: number | null;
  serverMismatch: boolean;
}

export interface TerminalState {
  terminalId: string;
  title: string;
  concept: string;
  challengeIndex: number;
  challenges: number;
  attemptNo: number;
  question: Question;
  display: Question;
  tampered: Tampered | null;
  hint: string | null;
  result: TerminalResultState | null;
  pending: boolean;
}

export interface DeathState {
  cause: EnemyDef | null;
  causeKey: string | null;
  context: string[];
}

export interface DebriefState {
  summary: PhaseSummary;
  elapsed: number;
  result: CompleteResult | null;
  error: string | null;
}

export interface GameSessionOptions {
  container: HTMLElement;
  reg: ContentRegistry;
  phaseId: string;
  backend: SessionBackend;
  settings: () => Settings;
}

const EVENT_FLUSH_MS = 4000;

export class GameSession {
  readonly mode = signal<GameMode>("loading");
  readonly terminal = signal<TerminalState | null>(null);
  readonly death = signal<DeathState | null>(null);
  readonly debrief = signal<DebriefState | null>(null);
  readonly newBadges = signal<BadgeAward[]>([]);
  readonly error = signal<string | null>(null);
  readonly pointerLocked = signal(false);

  world!: World;
  sessionId = "";
  seed = 0;
  elapsed = 0;
  private renderer!: Renderer;
  private hud!: Hud;
  private input: InputManager;
  private detachInput: (() => void) | null = null;
  private controls: PointerLockControls | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private disposed = false;
  private eventBuffer: TimedEvent[] = [];
  private inflight: Promise<boolean> | null = null;
  private answerQueue: AnswerRequest[] = [];
  private answersFlight: Promise<boolean> | null = null;
  private flushTimer = 0;
  private stepTimer = 0;
  private humTimer = 0;
  private resizeObs: ResizeObserver | null = null;
  private qualityChecked = false;
  private perfSamples: number[] = [];
  private stage: HTMLDivElement;

  constructor(private opts: GameSessionOptions) {
    this.input = new InputManager(opts.settings);
    this.stage = document.createElement("div");
    this.stage.className = "game-stage";
    opts.container.appendChild(this.stage);
  }

  get phase() { return this.world.phase; }

  async init(): Promise<void> {
    try {
      const start = await this.opts.backend.start(this.opts.phaseId);
      this.sessionId = start.sessionId;
      this.seed = start.seed >>> 0;
      this.world = createWorld({
        reg: this.opts.reg, phaseId: this.opts.phaseId, seed: this.seed,
        equippedUpgrades: start.equippedUpgrades, messageFactory: createMessageFactory(this.opts.reg.pools),
      });
      this.hud = new Hud(this.stage, this.opts.settings);
      this.renderer = new Renderer(this.stage, this.world, this.opts.settings, this.hud.floatLayer);
      this.stage.insertBefore(this.renderer.gl.domElement, this.hud.root);
      this.input.yaw = this.world.player.yaw;
      this.input.pitch = 0;
      this.detachInput = attachInput(this.input, this.renderer.gl.domElement);
      this.setupPointerLock();
      this.resizeObs = new ResizeObserver(() => this.renderer.resize());
      this.resizeObs.observe(this.stage);
      this.hud.setVisible(false);
      this.mode.value = "briefing";
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
      document.addEventListener("visibilitychange", this.onVisibility);
    } catch (err) {
      this.error.value = err instanceof Error ? err.message : String(err);
      this.mode.value = "error";
    }
  }

  private setupPointerLock(): void {
    const canvas = this.renderer.gl.domElement;
    this.controls = new PointerLockControls(new THREE.PerspectiveCamera(), canvas);
    this.controls.enabled = false; // o giro da câmera é feito pelo InputManager (sensibilidade/inversão)
    this.controls.addEventListener("lock", () => {
      // a captura é assíncrona: se o jogo saiu de "playing" enquanto ela era concedida (morte, terminal), devolve o ponteiro
      if (this.mode.value !== "playing") {
        this.controls?.unlock();
        return;
      }
      this.input.setLocked(true);
      this.pointerLocked.value = true;
    });
    this.controls.addEventListener("unlock", () => {
      this.input.setLocked(false);
      this.pointerLocked.value = false;
      this.input.releaseAll();
      if (this.mode.value === "playing") this.pause();
    });
    canvas.addEventListener("click", () => {
      if (this.mode.value === "playing" && !this.input.locked) this.requestLock();
    });
  }

  requestLock(): void {
    sfx.unlock();
    if (!this.controls || this.input.locked) return;
    try {
      this.controls.lock();
    } catch {
      /* navegadores sem Pointer Lock: segue sem captura */
    }
  }

  private releaseLock(): void {
    if (this.input.locked) this.controls?.unlock();
  }

  /** Permite jogar sem Pointer Lock (ambiente de teste automatizado). */
  forceLockedForTests(): void {
    this.input.setLocked(true);
    this.pointerLocked.value = true;
  }

  beginPlay(): void {
    if (this.mode.value !== "briefing") return;
    sfx.unlock();
    this.hud.setVisible(true);
    this.mode.value = "playing";
    this.input.enabled = true;
    this.last = performance.now();
    this.requestLock();
  }

  pause(): void {
    if (this.mode.value !== "playing") return;
    this.mode.value = "paused";
    this.input.enabled = false;
    this.input.releaseAll();
    this.releaseLock();
    this.flushEvents();
  }

  resume(): void {
    if (this.mode.value !== "paused") return;
    this.mode.value = "playing";
    this.input.enabled = true;
    this.last = performance.now();
    this.requestLock();
  }

  private onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      this.pause();
      sfx.suspend();
    } else sfx.resume();
  };

  // ───────────────────────── laço ─────────────────────────

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const w = this.world;
    const mode = this.mode.value;

    if (mode === "playing") {
      this.elapsed += dt;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 8) {
        stepWorld(w, this.input.build(), FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
        this.processEvents();
        if (w.status !== "playing") break;
      }
      if (this.acc > FIXED_DT * 8) this.acc = 0;
      if (this.input.consume("interact") && w.focusTerminal) this.openTerminal(w.focusTerminal);
      if (this.input.consume("pause")) this.pause();
      this.ambientSounds(dt);
      this.flushTimer += dt * 1000;
      if (this.flushTimer >= EVENT_FLUSH_MS) this.flushEvents();
      this.trackPerformance(dt);
    }
    if (mode === "dead") this.elapsed += dt;
    if (mode === "terminal") this.elapsed += dt;

    sfx.listener = { x: w.player.pos.x, z: w.player.pos.z, yaw: this.input.yaw };
    const alpha = mode === "playing" ? this.acc / FIXED_DT : 1;
    this.renderer.render(alpha, mode === "paused" ? 0 : dt, { yaw: this.input.yaw, pitch: this.input.pitch });
    this.hud.update(w, dt, this.elapsed, { yaw: this.input.yaw });
  };

  private trackPerformance(dt: number): void {
    if (this.qualityChecked || this.opts.settings().quality !== "high") return;
    this.perfSamples.push(dt);
    if (this.perfSamples.length < 300) return;
    this.qualityChecked = true;
    const sorted = this.perfSamples.slice(60).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0.016;
    if (median > 1 / 45) {
      this.renderer.setQuality("low");
      this.hud.toast("Desempenho baixo detectado: brilho neon desativado nesta partida.", "info");
    }
  }

  private ambientSounds(dt: number): void {
    const p = this.world.player;
    if (p.moving && p.onGround && p.alive) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = p.sprinting ? 0.3 : 0.44;
        sfx.play("step");
      }
    }
    if (p.shieldUp) {
      this.humTimer -= dt;
      if (this.humTimer <= 0) { this.humTimer = 0.17; sfx.play("shieldHum"); }
    }
  }

  private processEvents(): void {
    const w = this.world;
    const events = w.events.splice(0);
    if (events.length > 0) {
      this.renderer.handleEvents(events);
      this.hud.handleEvents(w, events);
      for (const ev of events) this.soundFor(ev);
    }
    if (w.outbox.length > 0) {
      const ts = new Date().toISOString();
      for (const e of w.outbox.splice(0)) this.eventBuffer.push({ event: e, clientTs: ts });
    }
    if (w.status === "dead" && this.mode.value === "playing") this.onDeath();
    if (w.status === "complete" && this.mode.value === "playing") void this.onComplete();
  }

  private soundFor(ev: SimEvent): void {
    const s = (name: SoundName, at?: { x: number; z: number }, g?: number): void => sfx.play(name, at, g);
    switch (ev.type) {
      case "shot": {
        const def = findWeaponDef(this.world.reg, ev.weaponId);
        s(def.kind === "hitscan" ? "pistol" : def.kind === "beam" ? "beam" : "cannon");
        break;
      }
      case "scan_pulse": s("scanner"); break;
      case "dry_fire": s("dry"); break;
      case "reload_start": s("reload"); break;
      case "weapon_switch": s("switch"); break;
      case "enemy_hit": s(ev.counter === "strong" ? "hitStrong" : ev.counter === "weak" ? "hitWeak" : "hit"); break;
      case "enemy_killed": s("kill", ev.pos); break;
      case "enemy_spawned": s(ev.reason === "replication" ? "replicate" : "spawn", ev.pos); break;
      case "enemy_projectile": s("enemyShot", ev.pos, 0.7); break;
      case "player_damaged": s("hurt"); break;
      case "player_died": s("death"); break;
      case "pickup": s(ev.fake ? "trap" : "pickup"); break;
      case "trojan_ambush": s("trap", ev.pos); break;
      case "door_opened": case "door_closed": s("door"); break;
      case "terminal_solved": s("terminalOk"); break;
      case "checkpoint": if (ev.reason !== "start") s("checkpoint"); break;
      case "arena_started": case "arena_wave": s("alarm"); break;
      case "explosion": s("explosion", ev.pos); break;
      case "shield_block": s("shieldBlock"); break;
      case "spawn_blocked": s("blocked", ev.pos); break;
      case "barrier_blocked": if (!ev.allowed) s("blocked", ev.pos, 0.5); break;
      case "enemy_revealed": s("reveal"); break;
      case "lockout": s("lockout"); break;
      case "encrypted": s("encrypt"); break;
      case "decrypted": s("decrypt"); break;
      case "encrypt_warning": s("alarm"); break;
      case "inbox": s("inbox"); break;
      case "exit_open": s("exit"); break;
      case "jump": s("jump"); break;
      case "vault_cracked": s("alarm"); break;
      case "mfa_saved": s("checkpoint"); break;
      case "terminal_corrupted": s("alarm"); break;
      case "terminal_cleaned": s("terminalOk"); break;
      default: break;
    }
  }

  /** Envia um lote (no máximo um em trânsito por vez). Resolve com false se o envio falhou. */
  private flushEvents(): Promise<boolean> {
    this.flushTimer = 0;
    if (this.answerQueue.length > 0) void this.flushAnswers();
    if (this.inflight) return this.inflight;
    if (this.eventBuffer.length === 0) return Promise.resolve(true);
    const batch = this.eventBuffer.splice(0, 100);
    this.inflight = this.opts.backend.sendEvents(this.sessionId, batch)
      .then((r) => {
        if (r.newBadges.length > 0) this.announceBadges(r.newBadges);
        return true;
      })
      .catch(() => {
        // devolve para a fila e tenta de novo no próximo ciclo
        this.eventBuffer.unshift(...batch);
        return false;
      })
      .finally(() => { this.inflight = null; });
    return this.inflight;
  }

  /** Espera a fila de eventos esvaziar (usado antes da conclusão, que depende deles). */
  private async drainEvents(): Promise<void> {
    if (!(await this.flushAnswers())) throw new Error(t("errors.network"));
    for (let round = 0; round < 50; round++) {
      if (this.inflight) { await this.inflight; continue; }
      if (this.eventBuffer.length === 0) return;
      if (!(await this.flushEvents())) throw new Error(t("errors.network"));
    }
  }

  private announceBadges(list: BadgeAward[]): void {
    this.newBadges.value = [...this.newBadges.value, ...list];
    for (const b of list) this.hud.toast(t("badges.new", { name: b.name }), "success");
  }

  // ───────────────────────── terminais ─────────────────────────

  openTerminal(id: string): void {
    const w = this.world;
    const acc = terminalAccess(w, id);
    if (!acc.ok) {
      sfx.play("blocked");
      return;
    }
    const term = acc.terminal;
    const seed = questionSeed(this.seed, id, acc.challengeIndex, acc.attemptNo);
    const question = generateQuestion(term.def.generator, term.def.params, seed, w.reg.pools);
    const tampered = acc.interceptedBy ? tamperQuestion(question, mulberry32(seed ^ 0x5bd1e995)) : null;
    this.terminal.value = {
      terminalId: id,
      title: term.def.title,
      concept: term.def.concept,
      challengeIndex: acc.challengeIndex,
      challenges: term.def.challenges,
      attemptNo: acc.attemptNo,
      question,
      display: tampered ? tampered.display : question,
      tampered,
      hint: w.mods.hints ? (term.def.hint || question.hint || null) : null,
      result: null,
      pending: false,
    };
    if (this.mode.value !== "terminal") {
      this.mode.value = "terminal";
      this.input.enabled = false;
      this.input.releaseAll();
      this.releaseLock();
      sfx.play("uiClick");
    }
  }

  submitAnswer(answer: AnswerValue): void {
    const st = this.terminal.value;
    if (!st || st.result || st.pending) return;
    const sent = st.tampered ? st.tampered.transit(answer) : answer;
    const local = checkAnswer(st.question, sent);
    // o efeito applyFirewallRules do terminal usa as regras que o jogador escreveu
    if (st.question.kind === "rules" && local.correct) this.world.pendingFirewall = sent as RulesAnswer;
    const outcome = applyTerminalResult(this.world, st.terminalId, local.correct, st.tampered !== null);
    this.processEvents();
    sfx.play(local.correct ? "terminalOk" : "terminalFail");
    const result: TerminalResultState = {
      correct: local.correct,
      items: local.items,
      explanation: st.question.explanation,
      tamperNote: st.tampered ? `${t("terminal.tamperedExplain")} ${st.tampered.change}` : null,
      solvedTerminal: outcome.solvedTerminal,
      xpDelta: null,
      serverMismatch: false,
    };
    this.terminal.value = { ...st, result, pending: this.opts.backend.online };
    void this.flushEvents();
    const req: AnswerRequest = { terminalId: st.terminalId, challengeIndex: st.challengeIndex, attemptNo: st.attemptNo, answer: sent, tampered: st.tampered !== null };
    this.opts.backend
      .answer(this.sessionId, req)
      .then((r) => {
        const cur = this.terminal.value;
        if (r.newBadges.length > 0) this.announceBadges(r.newBadges);
        if (!cur || cur.terminalId !== st.terminalId || cur.attemptNo !== st.attemptNo || !cur.result) return;
        this.terminal.value = {
          ...cur,
          pending: false,
          result: { ...cur.result, xpDelta: this.opts.backend.online ? r.xpDelta : null, serverMismatch: this.opts.backend.online && r.correct !== local.correct },
        };
      })
      .catch(() => {
        // o servidor precisa registrar a resposta para validar a conclusão: reenvia depois
        this.answerQueue.push(req);
        const cur = this.terminal.value;
        if (cur && cur.attemptNo === st.attemptNo) this.terminal.value = { ...cur, pending: false };
      });
  }

  /** Reenvia respostas que falharam, em ordem (uma rodada por vez). Resolve com false se alguma ainda falhar. */
  private flushAnswers(): Promise<boolean> {
    if (this.answersFlight) return this.answersFlight;
    this.answersFlight = (async () => {
      while (this.answerQueue.length > 0) {
        const req = this.answerQueue[0]!;
        try {
          const r = await this.opts.backend.answer(this.sessionId, req);
          if (r.newBadges.length > 0) this.announceBadges(r.newBadges);
        } catch {
          return false;
        }
        this.answerQueue.shift();
      }
      return true;
    })().finally(() => { this.answersFlight = null; });
    return this.answersFlight;
  }

  /** Após ver o resultado: próximo desafio, nova tentativa ou sair (se resolvido). */
  continueTerminal(): void {
    const st = this.terminal.value;
    if (!st?.result) return;
    if (st.result.solvedTerminal) {
      this.closeTerminal();
      return;
    }
    this.openTerminal(st.terminalId);
  }

  closeTerminal(): void {
    this.terminal.value = null;
    if (this.mode.value === "terminal") {
      this.mode.value = "playing";
      this.input.enabled = true;
      this.last = performance.now();
      this.requestLock();
    }
  }

  // ───────────────────────── morte e conclusão ─────────────────────────

  private onDeath(): void {
    const w = this.world;
    this.mode.value = "dead";
    this.input.enabled = false;
    this.input.releaseAll();
    this.releaseLock();
    const cause = w.deathCause ? w.reg.enemies.find((e) => e.id === w.deathCause) ?? null : null;
    const context: string[] = [];
    const worms = w.enemies.filter((e) => e.alive && e.behavior === "worm").length;
    if (worms >= 2) context.push(t("death.wormsAlive", { n: worms }));
    if (cause && (cause.behavior === "rootkit")) context.push(t("death.hiddenAttack"));
    this.death.value = { cause, causeKey: w.deathCause, context };
    this.flushEvents();
  }

  respawn(): void {
    if (this.mode.value !== "dead") return;
    respawn(this.world);
    this.processEvents();
    this.death.value = null;
    this.mode.value = "playing";
    this.input.enabled = true;
    this.last = performance.now();
    this.requestLock();
  }

  restartFromCheckpoint(): void {
    if (this.mode.value !== "paused") return;
    respawn(this.world);
    this.processEvents();
    this.resume();
  }

  private async onComplete(): Promise<void> {
    this.mode.value = "debrief";
    this.input.enabled = false;
    this.releaseLock();
    this.hud.setVisible(false);
    const summary = phaseSummary(this.world);
    this.debrief.value = { summary, elapsed: this.elapsed, result: null, error: null };
    try {
      // a validação da conclusão usa os eventos (abates, chefe): eles precisam chegar antes
      await this.drainEvents();
      const result = await this.opts.backend.complete(this.sessionId, summary, this.elapsed);
      this.debrief.value = { summary, elapsed: this.elapsed, result, error: null };
      if (result.newBadges.length > 0) this.newBadges.value = [...this.newBadges.value, ...result.newBadges];
    } catch (err) {
      this.debrief.value = { summary, elapsed: this.elapsed, result: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  retryComplete(): void {
    if (this.mode.value === "debrief" && this.debrief.value?.error) void this.onComplete();
  }

  /** Ganchos para testes automatizados (habilitados apenas com VITE_E2E=1). */
  debugApi(): Record<string, unknown> {
    return {
      world: () => this.world,
      mode: () => this.mode.value,
      teleport: (x: number, z: number) => { this.world.player.pos = { x, y: 0, z }; this.world.player.prevPos = { x, y: 0, z }; },
      openTerminal: (id: string) => this.openTerminal(id),
      terminal: () => this.terminal.value,
      forceLock: () => this.forceLockedForTests(),
      solveAll: () => {
        for (const term of this.world.terminals) {
          while (!term.solved) {
            const acc = terminalAccess(this.world, term.id);
            if (acc.ok) {
              const q = generateQuestion(term.def.generator, term.def.params, questionSeed(this.seed, term.id, acc.challengeIndex, acc.attemptNo), this.world.reg.pools);
              if (q.kind === "rules") this.world.pendingFirewall = { defaultPolicy: "deny", rules: q.answer.allowed.map((port) => ({ port, action: "allow" as const })) };
            }
            term.corrupted = false;
            applyTerminalResult(this.world, term.id, true, false);
          }
        }
        this.processEvents();
      },
      clearArenas: () => {
        const w = this.world;
        for (const e of w.enemies) if (e.alive && e.behavior !== "ransomware") e.alive = false;
        for (const a of w.arenas) {
          if (a.state === "cleared") continue;
          a.pending = [];
          a.state = "cleared";
          for (const d of a.def.lockDoors ?? []) openDoor(w, d);
          applyEffects(w, a.def.onClear);
        }
        this.processEvents();
      },
      hurt: (amount: number, source: string | null = null) => {
        this.world.player.invuln = 0;
        damagePlayer(this.world, amount, null, source, "effect");
        this.processEvents();
      },
      defeatBoss: () => {
        const boss = this.world.enemies.find((e) => e.id === this.world.bossId && e.alive);
        if (boss) killEnemy(this.world, boss, "patch_pistol", "neutral", false);
        this.processEvents();
      },
      finish: () => {
        const exit = this.world.zones.find((z) => z.type === "exit");
        if (!exit) return;
        const k = [...exit.cells][0]!;
        const pos = this.world.grid.cellToWorld([k % this.world.grid.cols, Math.floor(k / this.world.grid.cols)]);
        this.world.player.pos = { ...pos };
        this.world.player.prevPos = { ...pos };
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.flushEvents();
    this.detachInput?.();
    this.releaseLock();
    this.controls?.dispose();
    this.resizeObs?.disconnect();
    this.renderer?.dispose();
    this.hud?.dispose();
    this.stage.remove();
  }
}
