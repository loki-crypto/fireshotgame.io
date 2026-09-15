import type { Cell } from "../core/grid";
import type { EnemyDef, EnemyStatus } from "../core/types";
import type { Vec3 } from "../core/vec";
import type { Enemy } from "../world/entities";

export function createEnemy(id: string, def: EnemyDef, pos: Vec3, route: Cell[] = []): Enemy {
  return {
    id, type: def.id, def, behavior: def.behavior,
    pos: { ...pos }, prevPos: { ...pos }, home: { ...pos }, yaw: 0,
    hp: def.hp, maxHp: def.hp, radius: def.radius, height: def.height, hover: def.hover ?? 0,
    alive: true, state: "patrol", stateTime: 0,
    route, routeIndex: 0, path: [], pathCursor: 0, pathGoal: -1, repath: 0,
    attackTimer: 0, hitFlash: 0, revealedUntil: -1, disguised: false, lockedOutUntil: -1,
    statuses: new Set<EnemyStatus>(), data: {},
    spawnerId: null, arenaId: null, traffic: def.traffic ?? null, lastHitWeapon: null, passingBarrier: null,
  };
}

export const specialNum = (def: EnemyDef, key: string, fallback: number): number => {
  const v = def.special?.[key];
  return typeof v === "number" ? v : fallback;
};

export const specialStr = (def: EnemyDef, key: string, fallback: string): string => {
  const v = def.special?.[key];
  return typeof v === "string" ? v : fallback;
};
