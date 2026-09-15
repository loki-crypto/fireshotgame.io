import type { Cell } from "../core/grid";
import { findEnemyDef } from "../core/types";
import type { Vec3 } from "../core/vec";
import { createEnemy } from "../enemies/enemy";
import { getBehavior } from "../enemies/behaviors";
import type { Enemy } from "./entities";
import { emit, newId, type World } from "./world";

export interface SpawnOptions {
  reason: "spawner" | "replication" | "wave" | "effect" | "layout";
  route?: Cell[];
  spawnerId?: string | null;
  arenaId?: string | null;
  traffic?: number | null;
}

export function spawnEnemy(w: World, defId: string, pos: Vec3, opts: SpawnOptions): Enemy {
  const def = findEnemyDef(w.reg, defId);
  const e = createEnemy(newId(w, "e"), def, pos, opts.route ?? []);
  e.spawnerId = opts.spawnerId ?? null;
  e.arenaId = opts.arenaId ?? null;
  if (opts.traffic !== undefined && opts.traffic !== null) e.traffic = opts.traffic;
  w.enemies.push(e);
  getBehavior(e.behavior).onSpawn?.(w, e);
  if (opts.reason !== "layout") {
    emit(w, { type: "enemy_spawned", enemyId: e.id, enemyType: e.type, pos: { ...e.pos }, reason: opts.reason === "replication" ? "replication" : opts.reason === "wave" ? "wave" : opts.reason === "effect" ? "effect" : "spawner" });
  }
  return e;
}
