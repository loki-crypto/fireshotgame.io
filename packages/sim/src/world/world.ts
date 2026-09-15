import type { Rng } from "../core/rng";
import type { Grid } from "../core/grid";
import type { SimEvent, GameEvent } from "../core/events";
import type { ContentRegistry, FirewallRuleSet, PhaseDef, WeaponDef } from "../core/types";
import { findWeaponDef } from "../core/types";
import type { Vec3 } from "../core/vec";
import type { Player } from "../player/player";
import type { Modifiers } from "../progression/modifiers";
import type {
  ArenaState, Barrier, Checkpoint, Door, Enemy, InboxMessage, PhaseStats, Pickup, Projectile, Sign, Spawner,
  TerminalEntity, Vault, Zone,
} from "./entities";

export interface MessageContent {
  from: string;
  subject: string;
  body: string;
  signals: string[];
}

/** Fábrica de mensagens do HUD (phishing/legítimas). Injetada para manter o gerador de conteúdo separado. */
export type MessageFactory = (rng: Rng, kind: "phish" | "legit") => MessageContent;

export interface NavCache {
  field: Float32Array;
  fieldCell: number;
  fieldVersion: number;
  fieldTime: number;
}

export interface World {
  reg: ContentRegistry;
  phase: PhaseDef;
  seed: number;
  rng: Rng;
  time: number;
  tick: number;
  grid: Grid;
  player: Player;
  playerStart: { pos: Vec3; yaw: number };
  enemies: Enemy[];
  pickups: Pickup[];
  terminals: TerminalEntity[];
  doors: Door[];
  spawners: Spawner[];
  arenas: ArenaState[];
  zones: Zone[];
  vaults: Vault[];
  signs: Sign[];
  projectiles: Projectile[];
  barriers: Barrier[];
  inbox: InboxMessage[];
  flags: Set<string>;
  firewall: FirewallRuleSet;
  /** regras enviadas pelo terminal de firewall, aplicadas pelo efeito applyFirewallRules */
  pendingFirewall: FirewallRuleSet | null;
  upgradeMods: Modifiers;
  mods: Modifiers;
  equippedUpgrades: string[];
  weaponsAvailable: string[];
  encryptedUntil: number;
  encryptWarnUntil: number;
  vpnTunnelUntil: number;
  checkpoint: Checkpoint | null;
  backupAvailable: boolean;
  mfaAvailable: boolean;
  status: "playing" | "dead" | "complete";
  deathCause: string | null;
  bossId: string | null;
  bossDefeated: boolean;
  exitOpen: boolean;
  sessionBytes: number;
  stats: PhaseStats;
  lastDamageSource: string | null;
  focusTerminal: string | null;
  events: SimEvent[];
  outbox: GameEvent[];
  nextId: number;
  nav: NavCache;
  messageFactory: MessageFactory | null;
  /** temporizador de mensagens legítimas */
  legitTimer: number;
}

export const newId = (w: World, prefix: string): string => `${prefix}${++w.nextId}`;

export const emit = (w: World, e: SimEvent): void => { w.events.push(e); };

export const record = (w: World, e: GameEvent): void => { w.outbox.push(e); };

export const toast = (w: World, text: string, tone: "info" | "warn" | "success" | "danger" = "info"): void =>
  emit(w, { type: "toast", text, tone });

export function weaponDefAt(w: World, index: number): WeaponDef {
  const ws = w.player.weapons[index];
  if (!ws) throw new Error(`no weapon at ${index}`);
  return findWeaponDef(w.reg, ws.defId);
}

export const activeWeaponDef = (w: World): WeaponDef => weaponDefAt(w, w.player.active);

export function setFlag(w: World, flag: string): void {
  if (!w.flags.has(flag)) {
    w.flags.add(flag);
    emit(w, { type: "flag", flag });
  }
}

export const isEncrypted = (w: World): boolean => w.encryptedUntil > w.time;

export const aliveEnemies = (w: World): Enemy[] => w.enemies.filter((e) => e.alive);

export function portAllowed(rules: FirewallRuleSet, port: number): boolean {
  const rule = rules.rules.find((r) => r.port === port);
  if (rule) return rule.action === "allow";
  return rules.defaultPolicy === "allow";
}
