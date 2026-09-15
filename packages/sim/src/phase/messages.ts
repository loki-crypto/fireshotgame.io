import type { Cell } from "../core/grid";
import type { PickupKind } from "../core/types";
import type { InboxMessage } from "../world/entities";
import { emit, newId, record, toast, type MessageContent, type World } from "../world/world";
import { addPickup } from "./pickups";

const MESSAGE_TTL = 35;
const RANSOM_COST = 150;

const FALLBACK: Record<"phish" | "legit", MessageContent> = {
  phish: {
    from: "Suporte TI <suporte@rede-corp-seguranca.co>",
    subject: "URGENTE: sua munição expira em 30s",
    body: "Clique já e pegue o pacote bônus marcado no mapa antes que seja tarde!",
    signals: ["Domínio diferente do oficial (rede-corp-seguranca.co)", "Urgência artificial", "Oferta boa demais"],
  },
  legit: {
    from: "SOC <soc@redecorp.com.br>",
    subject: "Suprimentos liberados no setor",
    body: "Deixamos um pacote de suprimentos no ponto marcado. Nenhuma ação adicional é necessária.",
    signals: ["Domínio oficial (redecorp.com.br)", "Sem urgência", "Não pede credenciais nem pagamento"],
  },
};

/** Escolhe uma célula alcançável a 6–16 m do jogador para posicionar o pickup da mensagem. */
function pickCell(w: World): Cell | null {
  const grid = w.grid;
  const [pc, pr] = grid.worldToCell(w.player.pos.x, w.player.pos.z);
  const candidates: Cell[] = [];
  for (let r = pr - 8; r <= pr + 8; r++) for (let c = pc - 8; c <= pc + 8; c++) {
    if (!grid.isWalkable(c, r)) continue;
    const d = Math.hypot(c - pc, r - pr) * grid.cellSize;
    if (d < 6 || d > 16) continue;
    const f = w.nav.field[grid.cellIndex(c, r)];
    if (f === undefined || !Number.isFinite(f) || f * grid.cellSize > 24) continue;
    if (w.pickups.some((k) => k.active && grid.worldToCell(k.pos.x, k.pos.z).every((v, i) => v === [c, r][i]))) continue;
    candidates.push([c, r]);
  }
  return candidates.length > 0 ? w.rng.pick(candidates) : null;
}

export function createInboxMessage(w: World, kind: "phish" | "legit", enemyId: string | null): InboxMessage | null {
  const cell = pickCell(w);
  if (!cell) return null;
  const content = w.messageFactory ? w.messageFactory(w.rng, kind) : FALLBACK[kind];
  const pickupKind: PickupKind = w.rng.pick(["ammo", "health", "shield", "bytes"] as const);
  const id = newId(w, "m");
  const pk = addPickup(w, pickupKind, w.grid.cellToWorld(cell), { fake: kind === "phish", source: "message", messageId: id, amount: pickupKind === "bytes" ? 15 : undefined });
  const msg: InboxMessage = {
    id, kind, from: content.from, subject: content.subject, body: content.body, signals: content.signals,
    createdAt: w.time, expiresAt: w.time + MESSAGE_TTL, pickupId: pk.id, enemyId, resolved: "open",
  };
  w.inbox.push(msg);
  emit(w, { type: "inbox", messageId: id, kind });
  return msg;
}

/** Tecla de denúncia: denuncia a mensagem aberta mais recente (ou recusa/paga o resgate). */
export function reportLatest(w: World): void {
  const open = w.inbox.filter((m) => m.resolved === "open");
  const msg = open[open.length - 1];
  if (!msg) return;
  if (msg.kind === "ransom") {
    msg.resolved = "paid";
    w.stats.ransomPaid++;
    const paid = Math.min(RANSOM_COST, w.sessionBytes);
    w.sessionBytes -= paid;
    emit(w, { type: "phish_result", messageId: msg.id, outcome: "paid_ransom" });
    toast(w, "Você pagou o resgate e nada foi restaurado. Pagar não garante a chave: restaure do Backup.", "danger");
    return;
  }
  msg.resolved = "reported";
  const pk = msg.pickupId ? w.pickups.find((k) => k.id === msg.pickupId) : undefined;
  if (pk) pk.active = false;
  if (msg.kind === "phish") {
    w.stats.phishReported++;
    record(w, { type: "phish_reported", t: w.time, correct: true });
    emit(w, { type: "phish_result", messageId: msg.id, outcome: "reported_phish" });
    const phisher = msg.enemyId ? w.enemies.find((e) => e.id === msg.enemyId && e.alive) : undefined;
    if (phisher) phisher.revealedUntil = w.time + 10;
    toast(w, "Phishing denunciado! A isca foi removida e a origem marcada.", "success");
  } else {
    w.stats.phishFalsePositive++;
    record(w, { type: "phish_reported", t: w.time, correct: false });
    emit(w, { type: "phish_result", messageId: msg.id, outcome: "reported_legit" });
    toast(w, "Essa mensagem era legítima (domínio oficial, sem urgência). O suprimento foi descartado.", "warn");
  }
}

export function stepMessages(w: World, dt: number): void {
  for (const m of w.inbox) {
    if (m.resolved !== "open" || m.kind === "ransom") continue;
    if (w.time >= m.expiresAt) {
      m.resolved = "expired";
      const pk = m.pickupId ? w.pickups.find((k) => k.id === m.pickupId) : undefined;
      if (pk) pk.active = false;
    }
  }
  const every = w.phase.messages?.legitEvery;
  if (every && w.player.alive) {
    w.legitTimer -= dt;
    if (w.legitTimer <= 0) {
      w.legitTimer = every * (0.8 + w.rng.next() * 0.4);
      const open = w.inbox.filter((m) => m.resolved === "open").length;
      if (open < (w.phase.messages?.maxActive ?? 3)) createInboxMessage(w, "legit", null);
    }
  }
  if (w.inbox.length > 40) w.inbox = w.inbox.filter((m) => m.resolved === "open" || w.time - m.createdAt < 60);
}

export { RANSOM_COST };
