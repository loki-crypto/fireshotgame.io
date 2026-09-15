import { specialNum } from "../enemy";
import { emit, toast } from "../../world/world";
import { spawnEnemy } from "../../world/spawn";
import type { Behavior } from "./types";

/** Worm: autorreplicação. Duplica a cada N segundos enquanto estiver vivo (até um teto global). */
export const wormBehavior: Behavior = {
  onSpawn(w, e) {
    const every = specialNum(e.def, "replicateEvery", 12);
    e.data.replicateAt = w.time + every * (0.85 + w.rng.next() * 0.3);
  },
  update(w, e) {
    const at = e.data.replicateAt as number;
    if (w.time < at) return false;
    const every = specialNum(e.def, "replicateEvery", 12);
    e.data.replicateAt = w.time + every;
    const cap = specialNum(e.def, "replicaCap", 8);
    const alive = w.enemies.filter((x) => x.alive && x.type === e.type).length;
    if (alive >= cap) return false;
    const [c, r] = w.grid.worldToCell(e.pos.x, e.pos.z);
    const options: [number, number][] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if ((dc !== 0 || dr !== 0) && w.grid.isWalkable(c + dc, r + dr)) options.push([c + dc, r + dr]);
    }
    const cell = options.length > 0 ? w.rng.pick(options) : ([c, r] as [number, number]);
    const pos = w.grid.cellToWorld(cell);
    const child = spawnEnemy(w, e.type, pos, { reason: "replication", arenaId: e.arenaId, spawnerId: e.spawnerId, traffic: e.traffic });
    child.state = e.state === "patrol" ? "patrol" : "chase";
    w.stats.wormReplications++;
    emit(w, { type: "enemy_replicated", enemyId: child.id, parentId: e.id });
    if (w.stats.wormReplications === 1) toast(w, "Um Worm se replicou! Cópias vivas geram novas cópias: elimine-os primeiro.", "warn");
    return false;
  },
};
