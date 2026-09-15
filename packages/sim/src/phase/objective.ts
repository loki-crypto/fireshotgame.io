import type { World } from "../world/world";

export interface Objective {
  key: string;
  params?: Record<string, string | number>;
}

/** Objetivo atual (chave i18n + parâmetros) exibido no HUD. */
export function currentObjective(w: World): Objective {
  if (w.status === "complete") return { key: "objective.complete" };
  const active = w.arenas.find((a) => a.state === "active");
  if (active) return { key: "objective.arena", params: { title: active.def.title } };
  const req = w.phase.exit.requires;
  const required = w.terminals.filter((t) => !t.solved && (t.def.required || req.terminals?.includes(t.id)));
  const available = required.find((t) => (t.def.requires ?? []).every((id) => w.terminals.find((x) => x.id === id)?.solved));
  if (available) {
    if (available.corrupted) return { key: "objective.corrupted", params: { title: available.def.title } };
    return { key: "objective.terminal", params: { title: available.def.title } };
  }
  const arena = w.arenas.find((a) => a.state === "idle" && req.arenas?.includes(a.id));
  if (arena) return { key: "objective.findArena", params: { title: arena.def.title } };
  if (req.bossDefeated && !w.bossDefeated) return { key: "objective.boss" };
  if (w.exitOpen) return { key: "objective.exit" };
  return { key: "objective.explore" };
}
