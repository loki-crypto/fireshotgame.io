import { specialNum } from "../enemy";
import { createInboxMessage } from "../../phase/messages";
import type { Behavior } from "./types";

/** Phisher: mantém distância e envia mensagens falsas ao HUD oferecendo itens ou atalhos (iscas). */
export const phisherBehavior: Behavior = {
  onSpawn(w, e) {
    e.data.msgTimer = specialNum(e.def, "firstMessageAfter", 6) + w.rng.next() * 3;
  },
  update(w, e, dt) {
    if (!w.player.alive) return false;
    e.data.msgTimer = (e.data.msgTimer as number) - dt;
    if ((e.data.msgTimer as number) <= 0) {
      e.data.msgTimer = specialNum(e.def, "messageEvery", 16) * (0.8 + w.rng.next() * 0.4);
      const open = w.inbox.filter((m) => m.resolved === "open").length;
      if (open < specialNum(e.def, "maxOpenMessages", 3)) createInboxMessage(w, "phish", e.id);
    }
    return false;
  },
};
