/**
 * Tipos das definições de conteúdo. Espelham os JSON Schemas em packages/content/schemas.
 * A engine não conhece fases, inimigos ou armas específicos: tudo vem destes dados.
 */

// ───────────────────────── Inimigos ─────────────────────────

export type EnemyBehavior =
  | "worm" | "rootkit" | "trojan" | "swarm" | "mitm" | "bruteforcer" | "phisher" | "injector" | "ransomware" | "basic";

export type EnemyStatus = "hidden" | "revealed" | "disguised" | "locked_out" | "exposed" | "armored";

export type MeleeAttack = { type: "melee"; damage: number; range: number; cooldown: number };
export type RangedAttack = {
  type: "ranged"; damage: number; range: number; cooldown: number;
  projectileSpeed: number; projectileRadius: number; keepDistance?: number;
};
export type AttackDef = MeleeAttack | RangedAttack;

export interface EnemyDef {
  id: string;
  name: string;
  concept: string;
  description: string;
  behavior: EnemyBehavior;
  shape: string;
  color: string;
  hp: number;
  radius: number;
  height: number;
  /** altura de flutuação (drones, phishers) */
  hover?: number;
  speed: number;
  attack: AttackDef;
  fsm: { alertRadius: number; alertSeconds: number; chaseRadius: number; loseRadius: number };
  counters: {
    /** armas que são a contramedida correta (×2.5) */
    strong: string[];
    /** estados que tornam qualquer arma eficaz (×2.5), ex.: "revealed" */
    strongWhen?: EnemyStatus[];
    /** estados que tornam qualquer arma ineficaz (×0.5), ex.: "hidden" */
    weakWhen?: EnemyStatus[];
    /** se true, nenhuma arma é "incorreta" (Worm: qualquer arma serve, exige prioridade) */
    anyWeaponNeutral?: boolean;
  };
  /** porta/serviço do tráfego do inimigo, usado pelo firewall */
  traffic?: number;
  drops?: { bytesChance: number; bytesMin: number; bytesMax: number };
  xp: number;
  special?: Record<string, number | string | boolean>;
  explain: { death: string; tip: string };
}

// ───────────────────────── Armas ─────────────────────────

interface WeaponBase {
  id: string;
  name: string;
  slot: number;
  description: string;
  color: string;
  /** arma base: multiplicador ×1 contra tudo */
  base?: boolean;
}

export interface HitscanWeaponDef extends WeaponBase {
  kind: "hitscan";
  damage: number; rof: number; magazine: number; reserveMax: number | null; reserveStart?: number;
  reloadSeconds: number; spread: number; range: number;
}

export interface BeamWeaponDef extends WeaponBase {
  kind: "beam";
  damage: number; rof: number; magazine: number; reserveMax: number | null; reserveStart?: number;
  reloadSeconds: number; range: number;
  /** progresso de limpeza por segundo em terminais corrompidos (0..1) */
  cleanRate: number;
}

export interface ProjectileWeaponDef extends WeaponBase {
  kind: "projectile";
  damage: number; rof: number; magazine: number; reserveMax: number | null; reserveStart?: number;
  reloadSeconds: number; projectileSpeed: number; splashRadius: number; range: number;
  barrier?: { width: number; height: number; seconds: number; throttleSeconds: number };
}

export interface ScannerWeaponDef extends WeaponBase {
  kind: "scanner";
  energyMax: number; energyCost: number; energyRegen: number; cooldown: number;
  radius: number; revealSeconds: number;
}

export interface ShieldWeaponDef extends WeaponBase {
  kind: "shield";
  energyMax: number; energyDrain: number; energyRegen: number;
  coneDeg: number; tunnelLinger: number; pulseDamage: number; pulseInterval: number; pulseRange: number;
}

export type WeaponDef = HitscanWeaponDef | BeamWeaponDef | ProjectileWeaponDef | ScannerWeaponDef | ShieldWeaponDef;

export const isAmmoWeapon = (w: WeaponDef): w is HitscanWeaponDef | BeamWeaponDef | ProjectileWeaponDef =>
  w.kind === "hitscan" || w.kind === "beam" || w.kind === "projectile";

// ───────────────────────── Fases ─────────────────────────

export type PickupKind = "ammo" | "health" | "shield" | "bytes" | "backup" | "energy";

export type LegendEntry =
  | { type: "player" }
  | { type: "door"; id: string }
  | { type: "terminal"; id: string }
  | { type: "enemy"; enemy: string; route?: string }
  | { type: "spawner"; id: string }
  | { type: "pickup"; kind: PickupKind; amount?: number; fake?: boolean; disguiseOf?: string }
  | { type: "arena"; id: string }
  | { type: "exit" }
  | { type: "vault"; id: string }
  | { type: "sign"; text: string }
  | { type: "trigger"; id: string };

export type EffectDef =
  | { type: "openDoor"; door: string }
  | { type: "closeDoor"; door: string }
  | { type: "disableSpawner"; spawner: string }
  | { type: "enableSpawner"; spawner: string }
  | { type: "setFlag"; flag: string }
  | { type: "message"; text: string; tone?: "info" | "warn" | "success" }
  | { type: "spawnPickups"; kind: PickupKind; spawner: string; count: number; amount?: number }
  | { type: "spawnEnemies"; enemy: string; spawner: string; count: number }
  | { type: "applyFirewallRules" };

export interface TerminalDef {
  id: string;
  title: string;
  concept: string;
  generator: string;
  params?: Record<string, unknown>;
  /** respostas corretas necessárias para resolver */
  challenges: number;
  required: boolean;
  requires?: string[];
  onSolve: EffectDef[];
  hint?: string;
}

export interface SpawnerDef {
  id: string;
  /** spawn contínuo (fora de arenas) */
  enemy?: string;
  every?: number;
  max?: number;
  active?: boolean;
  traffic?: number;
}

export interface WaveSpawn { spawner: string; enemy: string; count: number; interval?: number; traffic?: number }
export interface WaveDef { spawns: WaveSpawn[]; delayAfter?: number; message?: string }

export interface ArenaDef {
  id: string;
  title: string;
  lockDoors?: string[];
  waves: WaveDef[];
  onClear: EffectDef[];
}

export interface TriggerDef {
  id: string;
  once?: boolean;
  effects: EffectDef[];
}

export interface VaultDef {
  id: string;
  /** tentativas necessárias para um Brute Forcer quebrar o cofre */
  crackAttempts: number;
  reward: { bytes: number };
}

export interface BriefingLine { speaker: string; text: string }

export interface FirewallRuleSet {
  defaultPolicy: "allow" | "deny";
  rules: { port: number; action: "allow" | "deny" }[];
}

export interface MessagesDef {
  /** gera mensagens legítimas de tempos em tempos (além das dos Phishers) */
  legitEvery?: number;
  maxActive?: number;
}

export interface PhaseDef {
  id: string;
  version: number;
  order: number;
  title: string;
  subtitle: string;
  concepts: string[];
  learningObjectives: string[];
  briefing: { lines: BriefingLine[] };
  debriefing: { summary: string[] };
  parTime: number;
  minTime: number;
  limits: { maxKills: number; maxBytes: number };
  tags: string[];
  weaponsAvailable: string[];
  introducesWeapon?: string;
  introducesEnemies?: string[];
  layout: { cellSize: number; wallHeight: number; rows: string[] };
  legend: Record<string, LegendEntry>;
  routes?: Record<string, [number, number][]>;
  terminals: TerminalDef[];
  spawners?: SpawnerDef[];
  arenas?: ArenaDef[];
  vaults?: VaultDef[];
  triggers?: TriggerDef[];
  exit: { requires: { terminals?: string[]; arenas?: string[]; bossDefeated?: boolean; flags?: string[] } };
  firewall?: { initial: FirewallRuleSet };
  messages?: MessagesDef;
  ambient?: { accent: string; fogDensity: number };
}

// ───────────────────────── Progressão ─────────────────────────

export type UpgradeEffect =
  | { stat: "damageMult" | "magazineMult" | "reloadMult" | "scannerDurationMult"; op: "mul"; value: number }
  | { stat: "maxHp" | "maxShield" | "shieldRegen"; op: "add"; value: number }
  | { flag: "mfa" | "hints" | "radar" | "backup" };

export interface UpgradeDef {
  id: string;
  branch: "offense" | "defense" | "analysis";
  tier: number;
  name: string;
  description: string;
  costBytes: number;
  requiresLevel: number;
  requires: string[];
  effects: UpgradeEffect[];
}

export type BadgeCriterion =
  | { type: "phase_completed"; phase: string }
  | { type: "streak"; counter: string; count: number }
  | { type: "counter"; counter: string; count: number }
  | { type: "phase_flag"; flag: string; phase?: string; requiresTag?: string; minWeapons?: number };

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: { shape: string; color: string };
  criterion: BadgeCriterion;
}

export interface ContentRegistry {
  enemies: EnemyDef[];
  weapons: WeaponDef[];
  phases: PhaseDef[];
  upgrades: UpgradeDef[];
  badges: BadgeDef[];
  pools: Record<string, unknown>;
}

export function findEnemyDef(reg: Pick<ContentRegistry, "enemies">, id: string): EnemyDef {
  const d = reg.enemies.find((e) => e.id === id);
  if (!d) throw new Error(`enemy def not found: ${id}`);
  return d;
}

export function findWeaponDef(reg: Pick<ContentRegistry, "weapons">, id: string): WeaponDef {
  const d = reg.weapons.find((w) => w.id === id);
  if (!d) throw new Error(`weapon def not found: ${id}`);
  return d;
}
