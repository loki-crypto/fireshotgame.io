import type { Vec3 } from "./vec";

/** Eventos efêmeros emitidos pela simulação a cada passo; consumidos por render, áudio e HUD. */
export type SimEvent =
  | { type: "shot"; weaponId: string; origin: Vec3; end: Vec3; hit: "enemy" | "wall" | "none" }
  | { type: "dry_fire"; weaponId: string }
  | { type: "reload_start"; weaponId: string }
  | { type: "reload_done"; weaponId: string }
  | { type: "weapon_switch"; weaponId: string }
  | { type: "enemy_hit"; enemyId: string; damage: number; counter: "strong" | "neutral" | "weak"; point: Vec3 }
  | { type: "enemy_killed"; enemyId: string; enemyType: string; weaponId: string; counter: "strong" | "neutral" | "weak"; pos: Vec3 }
  | { type: "enemy_spawned"; enemyId: string; enemyType: string; pos: Vec3; reason: "spawner" | "replication" | "wave" | "effect" }
  | { type: "enemy_state"; enemyId: string; state: string }
  | { type: "enemy_revealed"; enemyId: string }
  | { type: "enemy_replicated"; enemyId: string; parentId: string }
  | { type: "enemy_projectile"; pos: Vec3 }
  | { type: "inject_progress"; enemyId: string; terminalId: string; progress: number }
  | { type: "trojan_ambush"; enemyId: string; pos: Vec3 }
  | { type: "wall_hit"; point: Vec3; normal: Vec3 }
  | { type: "explosion"; pos: Vec3; radius: number; weaponId: string }
  | { type: "scan_pulse"; origin: Vec3; radius: number }
  | { type: "shield_block"; pos: Vec3 }
  | { type: "barrier_created"; barrierId: string }
  | { type: "barrier_blocked"; pos: Vec3; allowed: boolean }
  | { type: "spawn_blocked"; pos: Vec3; port: number }
  | { type: "player_damaged"; amount: number; from: Vec3 | null; source: string | null }
  | { type: "player_died"; cause: string | null }
  | { type: "mfa_saved" }
  | { type: "player_respawned" }
  | { type: "pickup"; kind: string; amount: number; fake: boolean; pos: Vec3 }
  | { type: "jump" }
  | { type: "door_opened"; doorId: string }
  | { type: "door_closed"; doorId: string }
  | { type: "terminal_solved"; terminalId: string }
  | { type: "terminal_corrupted"; terminalId: string }
  | { type: "terminal_cleaned"; terminalId: string }
  | { type: "checkpoint"; reason: string }
  | { type: "arena_started"; arenaId: string }
  | { type: "arena_wave"; arenaId: string; wave: number }
  | { type: "arena_cleared"; arenaId: string }
  | { type: "vault_attempt"; vaultId: string; attempts: number }
  | { type: "vault_cracked"; vaultId: string }
  | { type: "lockout"; enemyId: string }
  | { type: "toast"; text: string; tone: "info" | "warn" | "success" | "danger" }
  | { type: "inbox"; messageId: string; kind: "phish" | "legit" | "ransom" }
  | { type: "phish_result"; messageId: string; outcome: "reported_phish" | "reported_legit" | "took_phish" | "took_legit" | "paid_ransom" }
  | { type: "encrypted"; seconds: number }
  | { type: "decrypted" }
  | { type: "encrypt_warning"; seconds: number }
  | { type: "saturated"; on: boolean }
  | { type: "boss_defeated"; enemyId: string }
  | { type: "exit_open" }
  | { type: "phase_complete" }
  | { type: "flag"; flag: string };

/** Eventos persistentes enviados ao servidor (via fila do cliente). `t` = segundos desde o início da fase. */
export type GameEvent =
  | { type: "enemy_killed"; t: number; enemyType: string; weapon: string; counter: "strong" | "neutral" | "weak" }
  | { type: "pickup_collected"; t: number; kind: string; amount: number; fake: boolean }
  | { type: "player_died"; t: number; cause: string | null }
  | { type: "weapon_used"; t: number; weapon: string }
  | { type: "mitm_interference"; t: number; terminalId: string }
  | { type: "phish_reported"; t: number; correct: boolean }
  | { type: "vault_cracked"; t: number; vault: string }
  | { type: "boss_defeated"; t: number; boss: string }
  | { type: "checkpoint"; t: number; reason: string };
