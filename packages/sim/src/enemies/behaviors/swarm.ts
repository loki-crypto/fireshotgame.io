import type { Behavior } from "./types";

/** Drone de Botnet: fraco e numeroso. Separação entre drones evita empilhamento; saturação é tratada no passo do mundo. */
export const swarmBehavior: Behavior = {
  onSpawn(w, e) {
    e.data.phase = w.rng.next() * Math.PI * 2;
    e.state = "chase";
  },
  speedMult(w, e) {
    return 0.9 + 0.2 * Math.sin(w.time * 2 + (e.data.phase as number));
  },
};
