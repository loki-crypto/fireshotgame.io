import { specialNum } from "../enemy";
import { basicAI, distToPlayer, seesPlayer, setState } from "../ai";
import { adjacentWalkable, faceToward, goToCell } from "../navigation";
import { emit, toast } from "../../world/world";
import type { Behavior } from "./types";

/**
 * Injector: vai até terminais não resolvidos e os corrompe com entradas maliciosas.
 * Terminal corrompido fica inutilizável até ser limpo com o Sanitizer. Levar dano interrompe a injeção.
 */
export const injectorBehavior: Behavior = {
  onSpawn(_w, e) {
    e.data.channel = 0;
    e.data.target = null;
  },
  onDamaged(_w, e) {
    e.data.channel = 0;
  },
  update(w, e, dt) {
    if (distToPlayer(w, e) < specialNum(e.def, "aggroRadius", 4.5) && seesPlayer(w, e, 6)) {
      if (e.state === "patrol") setState(w, e, "chase");
      basicAI(w, e, dt);
      e.data.channel = 0;
      return true;
    }
    const targets = w.terminals.filter((t) => !t.solved && !t.corrupted);
    if (targets.length === 0) return false;
    const t = targets.sort((a, b) => Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) - Math.hypot(b.pos.x - e.pos.x, b.pos.z - e.pos.z))[0]!;
    if (e.data.target !== t.id) { e.data.target = t.id; e.data.channel = 0; }
    const stand = adjacentWalkable(w.grid, t.cell, e.pos);
    if (!stand) return false;
    const sp = w.grid.cellToWorld(stand);
    if (Math.hypot(sp.x - e.pos.x, sp.z - e.pos.z) > 0.6) {
      goToCell(w, e, stand, e.def.speed, dt);
      e.state = "chase";
      return true;
    }
    faceToward(e, t.pos);
    e.state = "special";
    const total = specialNum(e.def, "injectSeconds", 4);
    e.data.channel = (e.data.channel as number) + dt;
    if (w.tick % 15 === 0) emit(w, { type: "inject_progress", enemyId: e.id, terminalId: t.id, progress: (e.data.channel as number) / total });
    if ((e.data.channel as number) >= total) {
      t.corrupted = true;
      t.cleanProgress = 0;
      e.data.channel = 0;
      emit(w, { type: "terminal_corrupted", terminalId: t.id });
      toast(w, `Terminal "${t.def.title}" corrompido por entrada maliciosa! Limpe com o Sanitizer (5).`, "danger");
    }
    return true;
  },
};
