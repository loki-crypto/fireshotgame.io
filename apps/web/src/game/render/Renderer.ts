import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { findWeaponDef, terminalAccess, type Enemy, type SimEvent, type World } from "@fireshot/sim";
import type { Settings } from "../../app/settings";
import { buildLevel, updateTerminalScreen, type LevelView } from "./level";
import { createEnemyModel, type EnemyModel } from "./enemyModels";
import { createPickupModel, PICKUP_COLOR, type PickupModel } from "./pickupModels";
import { Effects, FloatingTexts } from "./effects";
import { ViewModel } from "./viewmodel";
import { PALETTE, neon } from "./palette";
import { barrierTexture, labelTexture } from "./textures";

interface EnemyView {
  model: EnemyModel;
  disguise: PickupModel | null;
  hpBar: THREE.Group;
  hpFill: THREE.Mesh;
  link: THREE.Line | null;
  status: THREE.Sprite | null;
  lastHp: number;
  showHpUntil: number;
}

const COUNTER_CLASS = { strong: "ft-strong", neutral: "ft-neutral", weak: "ft-weak" } as const;
const COUNTER_TEXT = { strong: "×2.5", neutral: "", weak: "×0.5" } as const;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private level: LevelView;
  private enemyViews = new Map<string, EnemyView>();
  private pickupViews = new Map<string, PickupModel>();
  private projectileViews = new Map<string, THREE.Mesh>();
  private barrierViews = new Map<string, THREE.Mesh>();
  private effects: Effects;
  readonly floating: FloatingTexts;
  private viewmodel: ViewModel;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private playerLight: THREE.PointLight;
  private shake = 0;
  private time = 0;
  private width = 1;
  private height = 1;
  private projGeo = new THREE.IcosahedronGeometry(1, 0);
  private hpGeo = new THREE.PlaneGeometry(1, 0.08);
  private barrierTex = barrierTexture();
  private warnTex = labelTexture("ISCA!", "#ff3d5a", "rgba(20,0,0,0.6)");
  private lockTex = labelTexture("TRAVADO", "#3dff8a", "rgba(0,20,0,0.6)");
  private injectTex = labelTexture("INJETANDO", "#ff3df0", "rgba(20,0,20,0.6)");
  private disposed = false;
  private quality: Settings["quality"];

  constructor(private container: HTMLElement, private world: World, private settings: () => Settings, private overlay: HTMLElement) {
    const s = settings();
    this.quality = s.quality;
    this.gl = new THREE.WebGLRenderer({ antialias: s.quality === "high", powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.quality === "high" ? 1.5 : 1));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.autoClear = false;
    this.gl.domElement.className = "game-canvas";
    container.appendChild(this.gl.domElement);

    this.scene.background = new THREE.Color(PALETTE.background);
    this.scene.fog = new THREE.FogExp2(PALETTE.background, world.phase.ambient?.fogDensity ?? 0.028);
    this.camera = new THREE.PerspectiveCamera(s.fov, 1, 0.05, 220);
    this.camera.rotation.order = "YXZ";
    this.scene.add(new THREE.HemisphereLight(0x4a6a9a, 0x05070d, 1.1));
    this.playerLight = new THREE.PointLight(0xbfe6ff, 22, 16, 1.6);
    this.scene.add(this.playerLight);

    this.level = buildLevel(world);
    this.scene.add(this.level.group);
    this.effects = new Effects(this.scene);
    this.floating = new FloatingTexts(overlay);
    this.viewmodel = new ViewModel(s.fov);
    this.setupPost();
    this.resize();
  }

  private setupPost(): void {
    if (this.quality !== "high") return;
    this.composer = new EffectComposer(this.gl);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.35, 0.18);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setQuality(q: Settings["quality"]): void {
    if (q === this.quality) return;
    this.quality = q;
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.5 : 1));
    this.setupPost();
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.gl.setSize(w, h, false);
    this.gl.domElement.style.width = "100%";
    this.gl.domElement.style.height = "100%";
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloom?.resolution.set(Math.max(64, w / 2), Math.max(64, h / 2));
    }
  }

  /** Converte eventos da simulação em efeitos visuais. */
  handleEvents(events: readonly SimEvent[]): void {
    const w = this.world;
    for (const ev of events) {
      switch (ev.type) {
        case "shot": {
          const def = findWeaponDef(w.reg, ev.weaponId);
          if (def.kind === "hitscan") {
            const from = this.muzzlePoint();
            this.effects.tracer(from, ev.end, def.color);
            this.viewmodel.kick(0.6);
          } else if (def.kind === "beam") {
            this.effects.beam(this.muzzlePoint(), ev.end, def.color);
            this.viewmodel.kick(0.12);
          } else {
            this.viewmodel.kick(1.2);
            if (!this.settings().reduceMotion) this.shake = Math.max(this.shake, 0.15);
          }
          break;
        }
        case "reload_start": this.viewmodel.startReload(); break;
        case "wall_hit": this.effects.sparks(ev.point, "#9fd8ff", 5, 3); break;
        case "enemy_hit": {
          const e = w.enemies.find((x) => x.id === ev.enemyId);
          const view = this.enemyViews.get(ev.enemyId);
          if (view) view.showHpUntil = this.time + 2.5;
          this.effects.sparks(ev.point, e?.def.color ?? "#ffffff", ev.counter === "strong" ? 12 : 5, ev.counter === "strong" ? 6 : 3);
          const txt = COUNTER_TEXT[ev.counter];
          if (txt) this.floating.add(txt, { x: ev.point.x, y: ev.point.y + 0.3, z: ev.point.z }, COUNTER_CLASS[ev.counter], 0.8);
          break;
        }
        case "enemy_killed": {
          const def = w.reg.enemies.find((d) => d.id === ev.enemyType);
          this.effects.fragments(ev.pos, def?.color ?? "#ffffff", (def?.radius ?? 0.5) * 2);
          this.effects.column(ev.pos, def?.color ?? "#ffffff", 2.5, 0.5);
          break;
        }
        case "enemy_spawned":
          this.effects.column(ev.pos, ev.reason === "replication" ? "#ff7a3d" : "#ff3d5a", w.grid.wallHeight, 0.8);
          if (ev.reason === "replication") this.floating.add("REPLICOU", { x: ev.pos.x, y: 1.4, z: ev.pos.z }, "ft-weak", 1.2);
          break;
        case "enemy_revealed": {
          const e = w.enemies.find((x) => x.id === ev.enemyId);
          if (e) this.floating.add("REVELADO", { x: e.pos.x, y: e.height + 0.6, z: e.pos.z }, "ft-strong", 1.2);
          break;
        }
        case "explosion": this.effects.explosion(ev.pos, ev.radius, "#ff9f1c"); break;
        case "scan_pulse": this.effects.pulse(ev.origin, ev.radius, "#b8ff3d", 0.7); break;
        case "shield_block": this.effects.sparks({ x: ev.pos.x, y: 1.4, z: ev.pos.z }, "#3dffc5", 10, 4); break;
        case "spawn_blocked":
          this.effects.column(ev.pos, "#ff9f1c", 2, 0.6);
          this.floating.add(`BLOQUEADO :${ev.port}`, { x: ev.pos.x, y: 1.6, z: ev.pos.z }, "ft-block", 1.4);
          break;
        case "barrier_blocked":
          if (ev.allowed) this.floating.add("VAZÃO LIMITADA", { x: ev.pos.x, y: 1.8, z: ev.pos.z }, "ft-neutral", 0.8);
          break;
        case "player_damaged":
          if (!this.settings().reduceMotion) this.shake = Math.min(0.35, this.shake + ev.amount * 0.012);
          break;
        case "trojan_ambush": this.effects.explosion({ x: ev.pos.x, y: 0.8, z: ev.pos.z }, 2, "#ffd23d"); break;
        case "pickup":
          this.effects.pulse(ev.pos, 1.2, ev.fake ? "#ff3d5a" : PICKUP_COLOR[ev.kind as keyof typeof PICKUP_COLOR] ?? "#ffffff", 0.4);
          break;
        case "terminal_solved": {
          const t = w.terminals.find((x) => x.id === ev.terminalId);
          if (t) this.effects.column(t.pos, PALETTE.ok, w.grid.wallHeight, 1.2);
          break;
        }
        case "terminal_corrupted": {
          const t = w.terminals.find((x) => x.id === ev.terminalId);
          if (t) this.effects.column(t.pos, PALETTE.corrupt, w.grid.wallHeight, 1.2);
          break;
        }
        case "vault_cracked": {
          const v = w.vaults.find((x) => x.id === ev.vaultId);
          if (v) this.effects.explosion({ x: v.pos.x, y: 1, z: v.pos.z }, 2.5, PALETTE.danger);
          break;
        }
        case "lockout": {
          const e = w.enemies.find((x) => x.id === ev.enemyId);
          if (e) this.effects.pulse(e.pos, 2.5, PALETTE.ok, 0.6);
          break;
        }
        case "encrypted": this.effects.pulse(w.player.pos, 6, PALETTE.danger, 0.9); break;
        case "decrypted": this.effects.pulse(w.player.pos, 4, "#ffffff", 0.6); break;
        case "checkpoint": this.effects.pulse(w.player.pos, 2, PALETTE.ok, 0.6); break;
        case "arena_started":
          if (!this.settings().reduceMotion) this.shake = Math.max(this.shake, 0.12);
          break;
        default:
          break;
      }
    }
  }

  private muzzlePoint(): { x: number; y: number; z: number } {
    const p = this.world.player;
    const yaw = p.yaw, pitch = p.pitch;
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return { x: p.pos.x + fx * 0.6 + rx * 0.22, y: p.pos.y + p.eyeHeight - 0.18 + fy * 0.6, z: p.pos.z + fz * 0.6 + rz * 0.22 };
  }

  private syncEnemies(alpha: number): void {
    const w = this.world;
    const seen = new Set<string>();
    for (const e of w.enemies) {
      if (!e.alive) continue;
      seen.add(e.id);
      let view = this.enemyViews.get(e.id);
      if (!view) {
        view = this.createEnemyView(e);
        this.enemyViews.set(e.id, view);
      }
      const x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
      const z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
      const m = view.model;
      m.root.position.set(x, 0, z);
      m.root.rotation.y = e.yaw;
      m.animate(this.time, e);

      // disfarce (Trojan)
      if (e.disguised) {
        if (!view.disguise) {
          view.disguise = createPickupModel("health", 1);
          this.scene.add(view.disguise.root);
        }
        view.disguise.root.position.set(x, 0, z);
        view.disguise.body.position.y = 0.7 + Math.sin(this.time * 2.3) * 0.08;
        view.disguise.body.rotation.y = this.time * 1.8 + Math.sin(this.time * 7) * 0.35;
        m.root.visible = false;
      } else {
        if (view.disguise) {
          this.scene.remove(view.disguise.root);
          view.disguise.dispose();
          view.disguise = null;
        }
        const hidden = e.statuses.has("hidden");
        if (e.behavior === "ransomware") {
          m.root.visible = !hidden || Math.sin(this.time * 23) > -0.2;
        } else {
          m.root.visible = !hidden;
        }
      }
      const revealed = e.revealedUntil > w.time;
      if (m.outline) {
        m.outline.visible = revealed && m.root.visible;
        (m.outline.material as THREE.LineBasicMaterial).opacity = 0.5 + 0.5 * Math.sin(this.time * 10);
      }
      // piscar ao levar dano
      const flash = e.hitFlash > 0;
      for (const f of m.flash) {
        if (flash) f.mat.color.setRGB(1, 1, 1);
        else f.mat.color.copy(f.base);
      }
      // barra de vida
      if (e.hp < view.lastHp) view.showHpUntil = this.time + 2.5;
      view.lastHp = e.hp;
      const showHp = m.root.visible && this.time < view.showHpUntil && e.behavior !== "ransomware";
      view.hpBar.visible = showHp;
      if (showHp) {
        view.hpBar.position.set(x, e.hover + e.height + 0.45, z);
        view.hpBar.quaternion.copy(this.camera.quaternion);
        const k = Math.max(0, e.hp / e.maxHp);
        view.hpFill.scale.x = k;
        view.hpFill.position.x = -(1 - k) / 2;
      }
      // links: MITM interceptando / Injector corrompendo
      const targetId = e.behavior === "mitm" ? (e.data.intercepting as string | null) : e.behavior === "injector" && e.state === "special" ? (e.data.target as string | null) : null;
      const term = targetId ? w.terminals.find((t) => t.id === targetId) : undefined;
      if (term && m.root.visible) {
        if (!view.link) {
          const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
          view.link = new THREE.Line(g, new THREE.LineDashedMaterial({ color: e.def.color, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.9 }));
          this.scene.add(view.link);
        }
        const arr = view.link.geometry.getAttribute("position") as THREE.BufferAttribute;
        arr.setXYZ(0, x, e.hover + e.height * 0.6, z);
        arr.setXYZ(1, term.pos.x, 1.35, term.pos.z);
        arr.needsUpdate = true;
        view.link.computeLineDistances();
        view.link.visible = true;
      } else if (view.link) view.link.visible = false;
      // rótulo de estado
      const statusTex = e.lockedOutUntil > w.time ? this.lockTex : e.behavior === "injector" && e.state === "special" ? this.injectTex : null;
      if (statusTex) {
        if (!view.status) {
          view.status = new THREE.Sprite(new THREE.SpriteMaterial({ map: statusTex, transparent: true, depthTest: false }));
          view.status.scale.set(1.4, 0.35, 1);
          this.scene.add(view.status);
        }
        view.status.material.map = statusTex;
        view.status.position.set(x, e.hover + e.height + 0.85, z);
        view.status.visible = true;
      } else if (view.status) view.status.visible = false;
    }
    for (const [id, view] of this.enemyViews) {
      if (seen.has(id)) continue;
      this.disposeEnemyView(view);
      this.enemyViews.delete(id);
    }
  }

  private createEnemyView(e: Enemy): EnemyView {
    const model = createEnemyModel(e);
    this.scene.add(model.root);
    const hpBar = new THREE.Group();
    const bg = new THREE.Mesh(this.hpGeo, neon("#000000", { transparent: true, opacity: 0.6 }));
    const fill = new THREE.Mesh(this.hpGeo, neon(e.def.color));
    fill.position.z = 0.001;
    hpBar.add(bg, fill);
    hpBar.visible = false;
    this.scene.add(hpBar);
    return { model, disguise: null, hpBar, hpFill: fill, link: null, status: null, lastHp: e.hp, showHpUntil: 0 };
  }

  private disposeEnemyView(view: EnemyView): void {
    this.scene.remove(view.model.root, view.hpBar);
    view.model.dispose();
    if (view.disguise) { this.scene.remove(view.disguise.root); view.disguise.dispose(); }
    if (view.link) { this.scene.remove(view.link); view.link.geometry.dispose(); (view.link.material as THREE.Material).dispose(); }
    if (view.status) { this.scene.remove(view.status); view.status.material.dispose(); }
  }

  private syncPickups(): void {
    const seen = new Set<string>();
    for (const k of this.world.pickups) {
      if (!k.active) continue;
      seen.add(k.id);
      let view = this.pickupViews.get(k.id);
      if (!view) {
        view = createPickupModel(k.kind, k.fake ? 0.8 : 0, this.warnTex);
        view.root.position.set(k.pos.x, 0, k.pos.z);
        this.scene.add(view.root);
        this.pickupViews.set(k.id, view);
      }
      const jitter = k.fake ? Math.sin(this.time * 9 + k.pos.x) * 0.3 : 0;
      view.body.position.y = 0.7 + Math.sin(this.time * 2.2 + k.pos.z) * 0.08;
      view.body.rotation.y = this.time * 1.6 + jitter;
      if (view.warn) view.warn.visible = k.fake && k.revealed;
      if (k.fake && k.revealed) for (const m of view.mats) m.color.set(PALETTE.danger);
      if (k.fake && !k.revealed) view.body.visible = Math.sin(this.time * 31 + k.pos.x * 3) > -0.92;
    }
    for (const [id, view] of this.pickupViews) {
      if (seen.has(id)) continue;
      this.scene.remove(view.root);
      view.dispose();
      this.pickupViews.delete(id);
    }
  }

  private syncProjectiles(alpha: number): void {
    const seen = new Set<string>();
    for (const p of this.world.projectiles) {
      seen.add(p.id);
      let m = this.projectileViews.get(p.id);
      if (!m) {
        const color = p.owner === "player" ? "#ff9f1c" : (this.world.reg.enemies.find((d) => d.id === p.sourceType)?.color ?? "#ff3d5a");
        m = new THREE.Mesh(this.projGeo, neon(color));
        m.scale.setScalar(p.radius * (p.owner === "player" ? 1.2 : 1));
        this.scene.add(m);
        this.projectileViews.set(p.id, m);
      }
      m.position.set(p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha, p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha, p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha);
      m.rotation.x += 0.2;
      m.rotation.y += 0.15;
    }
    for (const [id, m] of this.projectileViews) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      this.projectileViews.delete(id);
    }
  }

  private syncBarriers(): void {
    const w = this.world;
    const seen = new Set<string>();
    for (const b of w.barriers) {
      seen.add(b.id);
      let m = this.barrierViews.get(b.id);
      if (!m) {
        const mat = new THREE.MeshBasicMaterial({ map: this.barrierTex.clone(), color: "#ff9f1c", transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        mat.map!.needsUpdate = true;
        mat.map!.repeat.set(b.halfWidth, b.height / 2);
        m = new THREE.Mesh(new THREE.PlaneGeometry(b.halfWidth * 2, b.height), mat);
        m.position.set(b.center.x, b.height / 2, b.center.z);
        m.rotation.y = Math.atan2(b.nx, b.nz);
        this.scene.add(m);
        this.barrierViews.set(b.id, m);
      }
      const mat = m.material as THREE.MeshBasicMaterial;
      const left = b.until - w.time;
      mat.opacity = Math.min(0.55, left * 0.4) * (0.85 + 0.15 * Math.sin(this.time * 12));
      if (mat.map) mat.map.offset.y -= 0.01;
    }
    for (const [id, m] of this.barrierViews) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.MeshBasicMaterial).map?.dispose();
      (m.material as THREE.Material).dispose();
      this.barrierViews.delete(id);
    }
  }

  private syncLevel(dt: number): void {
    const w = this.world;
    for (const dv of this.level.doors) {
      const d = w.doors.find((x) => x.id === dv.id);
      if (!d) continue;
      for (const m of dv.meshes) {
        m.position.y = dv.baseY + d.amount * (w.grid.wallHeight - 0.2);
        m.visible = d.amount < 0.98;
      }
    }
    for (const tv of this.level.terminals) {
      const t = w.terminals.find((x) => x.id === tv.id)!;
      const acc = terminalAccess(w, t.id);
      const status = t.solved ? "solved" : t.corrupted ? "corrupted" : !acc.ok && acc.reason === "locked" ? "locked" : "available";
      const line = t.corrupted && t.cleanProgress > 0 ? `LIMPANDO ${Math.round(t.cleanProgress * 100)}%` : undefined;
      updateTerminalScreen(tv, { title: t.def.title, status, line });
      tv.light.rotation.y += dt * 2;
      tv.beacon.visible = !t.solved;
    }
    for (const vv of this.level.vaults) {
      const v = w.vaults.find((x) => x.id === vv.id)!;
      vv.dial.rotation.y += dt * (v.attempts > 0 && !v.cracked ? 6 : 0.5);
      if (v.cracked && !vv.cracked) {
        vv.cracked = true;
        (vv.body.material as THREE.MeshLambertMaterial).emissive.set(0x5a0a10);
      }
    }
    for (const ev of this.level.exits) {
      if (w.exitOpen !== ev.open) {
        ev.open = w.exitOpen;
        const c = w.exitOpen ? PALETTE.ok : PALETTE.danger;
        ev.ring.material = neon(c, { transparent: true, opacity: 0.9 });
        ev.beam.material = neon(c, { additive: true, opacity: w.exitOpen ? 0.35 : 0.12 });
      }
      ev.ring.rotation.z += dt * (w.exitOpen ? 2 : 0.3);
    }
    for (const [id, mark] of this.level.arenaMarks) {
      const a = w.arenas.find((x) => x.id === id);
      mark.visible = a?.state !== "cleared";
      (mark.material as THREE.MeshBasicMaterial).opacity = a?.state === "active" ? 0.12 + 0.06 * Math.sin(this.time * 6) : 0.07;
    }
  }

  render(alpha: number, dt: number, look: { yaw: number; pitch: number }): void {
    if (this.disposed) return;
    const s = this.settings();
    this.time += dt;
    const p = this.world.player;
    const x = p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha;
    const y = p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha;
    const z = p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha;
    const bob = p.moving && p.onGround && !s.reduceMotion ? Math.abs(Math.sin(this.time * (p.sprinting ? 12 : 8.5))) * 0.045 : 0;
    this.camera.position.set(x, y + p.eyeHeight + bob, z);
    const yaw = this.world.status === "dead" ? p.yaw : look.yaw;
    const pitch = this.world.status === "dead" ? p.pitch : look.pitch;
    this.camera.rotation.set(pitch, yaw, 0);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    if (this.world.status === "dead") this.camera.position.y = Math.max(0.4, this.camera.position.y - 1.1);
    if (this.camera.fov !== s.fov) { this.camera.fov = s.fov; this.camera.updateProjectionMatrix(); }
    this.playerLight.position.set(x, y + 2.4, z);

    this.syncLevel(dt);
    this.syncEnemies(alpha);
    this.syncPickups();
    this.syncProjectiles(alpha);
    this.syncBarriers();
    this.effects.update(dt);

    const ws = p.weapons[p.active];
    if (ws) {
      const def = findWeaponDef(this.world.reg, ws.defId);
      this.viewmodel.setWeapon(def.id, def.color);
    }
    this.viewmodel.update(dt, p.moving && p.onGround, p.sprinting, p.shieldUp, s.reduceMotion, this.camera.aspect, s.fov);

    this.gl.clear();
    if (this.composer) this.composer.render(dt);
    else this.gl.render(this.scene, this.camera);
    if (this.world.status !== "dead") {
      this.gl.clearDepth();
      this.gl.render(this.viewmodel.scene, this.viewmodel.camera);
    }
    this.floating.update(dt, this.camera, this.width, this.height);
  }

  dispose(): void {
    this.disposed = true;
    for (const v of this.enemyViews.values()) this.disposeEnemyView(v);
    for (const v of this.pickupViews.values()) v.dispose();
    this.effects.dispose();
    this.floating.clear();
    this.level.dispose();
    this.composer?.dispose();
    this.projGeo.dispose();
    this.hpGeo.dispose();
    this.barrierTex.dispose();
    this.warnTex.dispose();
    this.lockTex.dispose();
    this.injectTex.dispose();
    this.gl.dispose();
    this.gl.domElement.remove();
  }
}
