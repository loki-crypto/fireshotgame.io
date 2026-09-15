import { specialNum } from "../enemy";
import { damagePlayer } from "../../world/combat";
import { emit, record, toast } from "../../world/world";
import type { Behavior } from "./types";

/** Trojan: disfarçado de pickup legítimo; ao se aproximar, ataca. O Scanner revela o disfarce antes. */
export const trojanBehavior: Behavior = {
  onSpawn(_w, e) {
    e.disguised = true;
  },
  update(w, e) {
    if (!e.disguised) return false;
    const d = Math.hypot(w.player.pos.x - e.pos.x, w.player.pos.z - e.pos.z);
    if (d <= specialNum(e.def, "ambushRadius", 2.2) && w.player.alive) {
      e.disguised = false;
      e.state = "attack";
      e.stateTime = 0;
      w.stats.fakePickups++;
      record(w, { type: "pickup_collected", t: w.time, kind: "trojan", amount: 0, fake: true });
      emit(w, { type: "trojan_ambush", enemyId: e.id, pos: { ...e.pos } });
      damagePlayer(w, specialNum(e.def, "ambushDamage", 20), { ...e.pos }, e.type, "effect");
      toast(w, "Era um Trojan disfarçado de item! Sinais: brilho irregular e cor levemente diferente.", "danger");
    }
    return true;
  },
  onRevealed(w, e) {
    if (e.state === "patrol") { e.state = "alert"; e.stateTime = 0; }
    if (!w.flags.has("hint:trojan_revealed")) {
      w.flags.add("hint:trojan_revealed");
      toast(w, "Scanner expôs um Trojan disfarçado. Revelado, ele recebe dano ×2.5.", "success");
    }
  },
};
