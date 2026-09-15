import type { Cell } from "../core/grid";
import type { Vec3 } from "../core/vec";
import type { ArenaDef, EnemyBehavior, EnemyDef, EnemyStatus, PickupKind, SpawnerDef, TerminalDef, VaultDef, WaveSpawn } from "../core/types";

export type EnemyState = "patrol" | "alert" | "chase" | "attack" | "special";

export interface Enemy {
  id: string;
  type: string;
  def: EnemyDef;
  behavior: EnemyBehavior;
  pos: Vec3;
  prevPos: Vec3;
  home: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  hover: number;
  alive: boolean;
  state: EnemyState;
  stateTime: number;
  route: Cell[];
  routeIndex: number;
  path: Cell[];
  pathCursor: number;
  pathGoal: number;
  repath: number;
  attackTimer: number;
  hitFlash: number;
  revealedUntil: number;
  disguised: boolean;
  lockedOutUntil: number;
  statuses: Set<EnemyStatus>;
  /** dados específicos do comportamento */
  data: Record<string, number | string | boolean | null>;
  spawnerId: string | null;
  arenaId: string | null;
  traffic: number | null;
  lastHitWeapon: string | null;
  /** barreira que está atravessando (vazão controlada) */
  passingBarrier: string | null;
}

export interface Door {
  id: string;
  cells: Cell[];
  open: boolean;
  /** 0 = fechada, 1 = aberta (para animação) */
  amount: number;
}

export interface TerminalEntity {
  id: string;
  def: TerminalDef;
  cell: Cell;
  pos: Vec3;
  /** direção (XZ) do console para o chão livre à frente */
  facing: { x: number; z: number };
  solvedChallenges: number;
  /** tentativas já feitas no desafio atual */
  attemptsOnChallenge: number;
  totalAttempts: number;
  solved: boolean;
  /** todos os desafios acertados na primeira tentativa até agora */
  firstTry: boolean;
  corrupted: boolean;
  cleanProgress: number;
}

export interface Pickup {
  id: string;
  kind: PickupKind;
  amount: number;
  pos: Vec3;
  active: boolean;
  /** isca (phishing): parece legítimo */
  fake: boolean;
  /** isca revelada pelo Scanner */
  revealed: boolean;
  source: "layout" | "drop" | "effect" | "message";
  messageId: string | null;
}

export interface Spawner {
  id: string;
  def: SpawnerDef;
  cell: Cell;
  pos: Vec3;
  active: boolean;
  timer: number;
  alive: string[];
}

export interface PendingSpawn extends WaveSpawn {
  remaining: number;
  timer: number;
}

export interface ArenaState {
  id: string;
  def: ArenaDef;
  state: "idle" | "active" | "cleared";
  wave: number;
  pending: PendingSpawn[];
  alive: string[];
  delay: number;
}

export interface Zone {
  id: string;
  type: "arena" | "exit" | "trigger";
  cells: Set<number>;
  fired: boolean;
}

export interface Vault {
  id: string;
  def: VaultDef;
  cell: Cell;
  pos: Vec3;
  attempts: number;
  cracked: boolean;
}

export interface Sign {
  text: string;
  pos: Vec3;
  cell: Cell;
}

export interface Projectile {
  id: string;
  owner: "player" | "enemy";
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  radius: number;
  damage: number;
  ttl: number;
  weaponId: string | null;
  sourceEnemy: string | null;
  sourceType: string | null;
  splash: number;
}

export interface Barrier {
  id: string;
  center: Vec3;
  /** normal da barreira no plano XZ (unitária) */
  nx: number;
  nz: number;
  halfWidth: number;
  height: number;
  createdAt: number;
  until: number;
  throttle: number;
  nextPass: number;
}

export interface InboxMessage {
  id: string;
  kind: "phish" | "legit" | "ransom";
  from: string;
  subject: string;
  body: string;
  /** sinais que distinguem a mensagem (exibidos na explicação) */
  signals: string[];
  createdAt: number;
  expiresAt: number;
  pickupId: string | null;
  enemyId: string | null;
  resolved: "open" | "reported" | "taken" | "expired" | "paid";
}

export interface PhaseStats {
  kills: Record<string, number>;
  killsTotal: number;
  killsStrong: number;
  killsWeak: number;
  revealedKills: Record<string, number>;
  shots: number;
  hits: number;
  damageTaken: number;
  deaths: number;
  terminalsSolved: number;
  terminalsFirstTry: number;
  terminalAttempts: number;
  terminalCorrect: number;
  weaponsUsed: string[];
  fakePickups: number;
  mitmInterference: number;
  phishReported: number;
  phishFalsePositive: number;
  ransomPaid: number;
  wormReplications: number;
  bytesCollected: number;
  vaultsCracked: number;
  spawnsBlocked: number;
  mfaUsed: boolean;
  checkpointsUsed: number;
}

export const emptyStats = (): PhaseStats => ({
  kills: {}, killsTotal: 0, killsStrong: 0, killsWeak: 0, revealedKills: {},
  shots: 0, hits: 0, damageTaken: 0, deaths: 0,
  terminalsSolved: 0, terminalsFirstTry: 0, terminalAttempts: 0, terminalCorrect: 0,
  weaponsUsed: [], fakePickups: 0, mitmInterference: 0, phishReported: 0, phishFalsePositive: 0, ransomPaid: 0,
  wormReplications: 0, bytesCollected: 0, vaultsCracked: 0, spawnsBlocked: 0, mfaUsed: false, checkpointsUsed: 0,
});

export interface Checkpoint {
  pos: Vec3;
  yaw: number;
  hp: number;
  shield: number;
  magazines: { defId: string; magazine: number; reserve: number | null }[];
  time: number;
  reason: string;
}
