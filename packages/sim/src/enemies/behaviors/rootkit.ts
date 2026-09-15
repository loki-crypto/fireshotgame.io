import { toast } from "../../world/world";
import type { Behavior } from "./types";

/** Rootkit: oculto até ser revelado pelo Scanner. Oculto recebe ×0.5; revelado recebe ×2.5 (JSON). */
export const rootkitBehavior: Behavior = {
  statuses(w, e, out) {
    if (e.revealedUntil <= w.time) out.add("hidden");
  },
  onDamaged(w, e) {
    if (e.revealedUntil <= w.time && !w.flags.has("hint:rootkit_blind")) {
      w.flags.add("hint:rootkit_blind");
      toast(w, "Tiros às cegas quase não afetam o Rootkit. Revele-o com o Scanner (2).", "warn");
    }
  },
  update(w, e) {
    // aviso na primeira vez que um oculto causa dano
    if (e.state === "attack" && e.revealedUntil <= w.time && !w.flags.has("hint:rootkit_hidden")) {
      w.flags.add("hint:rootkit_hidden");
      toast(w, "Integridade caindo sem origem visível: algo oculto está atacando. Use o Scanner.", "danger");
    }
    return false;
  },
  speedMult(w, e) {
    return e.revealedUntil > w.time ? 0.8 : 1;
  },
};
