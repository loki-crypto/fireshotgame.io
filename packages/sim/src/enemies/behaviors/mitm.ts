import { specialNum } from "../enemy";
import { basicAI, seesPlayer } from "../ai";
import { goToCell } from "../navigation";
import type { Behavior } from "./types";

/**
 * MITM: posiciona-se entre o jogador e o terminal mais próximo e intercepta a conexão.
 * Enquanto intercepta, as opções exibidas no terminal são adulteradas (a menos que o túnel VPN esteja ativo).
 */
export const mitmBehavior: Behavior = {
  onSpawn(_w, e) {
    e.data.intercepting = null;
  },
  update(w, e, dt) {
    const radius = specialNum(e.def, "interceptRadius", 14);
    const range = specialNum(e.def, "mitmRange", 7);
    let bestIdx = -1;
    let bestD = Infinity;
    w.terminals.forEach((t, i) => {
      if (t.solved) return;
      const d = Math.hypot(t.pos.x - w.player.pos.x, t.pos.z - w.player.pos.z);
      if (d < bestD) { bestD = d; bestIdx = i; }
    });
    e.data.intercepting = null;
    if (bestIdx < 0 || bestD > radius || !w.player.alive) return false;
    const t = w.terminals[bestIdx]!;
    const dT = Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z);
    if (dT <= range) e.data.intercepting = t.id;
    // alvo: ponto entre jogador e terminal
    const mx = t.pos.x + (w.player.pos.x - t.pos.x) * 0.45;
    const mz = t.pos.z + (w.player.pos.z - t.pos.z) * 0.45;
    const cell = w.grid.nearestWalkable(w.grid.worldToCell(mx, mz), 3);
    if (cell) goToCell(w, e, cell, e.def.speed, dt);
    // continua atirando se enxerga o jogador
    if (seesPlayer(w, e, e.def.attack.range)) {
      const prev = e.state;
      e.state = "attack";
      basicAI(w, e, 0);
      if (prev === "patrol") e.state = "attack";
    }
    return true;
  },
};

/** O terminal está sendo interceptado por um MITM vivo (e o túnel VPN não está ativo)? */
export function interceptorOf(w: import("../../world/world").World, terminalId: string): string | null {
  if (w.vpnTunnelUntil > w.time) return null;
  const e = w.enemies.find((x) => x.alive && x.behavior === "mitm" && x.data.intercepting === terminalId);
  return e ? e.id : null;
}
