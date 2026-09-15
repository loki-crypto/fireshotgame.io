import { registry } from "@fireshot/content";
import {
  createWorld, emptyInput, eyePosition, stepWorld, type ContentRegistry, type PhaseDef, type PlayerInput, type Vec3, type World,
} from "../src";

export function makePhase(p: Partial<PhaseDef> & Pick<PhaseDef, "layout" | "legend">): PhaseDef {
  return {
    id: "test", version: 1, order: 999, title: "Teste", subtitle: "", concepts: [], learningObjectives: [],
    briefing: { lines: [] }, debriefing: { summary: [] }, parTime: 100, minTime: 1,
    limits: { maxKills: 100, maxBytes: 100 }, tags: ["practice"], weaponsAvailable: ["patch_pistol"],
    terminals: [], exit: { requires: {} },
    ...p,
  };
}

export function rows(...r: string[]): PhaseDef["layout"] {
  return { cellSize: 2, wallHeight: 3.2, rows: r };
}

export function regWith(phase: PhaseDef): ContentRegistry {
  return { ...registry, phases: [...registry.phases.filter((x) => x.id !== phase.id), phase] };
}

export function makeWorld(phase: PhaseDef, seed = 1, equipped: string[] = []): World {
  return createWorld({ reg: regWith(phase), phaseId: phase.id, seed, equippedUpgrades: equipped });
}

export function input(over: Partial<PlayerInput> = {}): PlayerInput {
  return { ...emptyInput(), ...over };
}

export function run(w: World, seconds: number, inp: Partial<PlayerInput> | ((w: World) => Partial<PlayerInput>) = {}): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    const over = typeof inp === "function" ? inp(w) : inp;
    stepWorld(w, input({ yaw: w.player.yaw, pitch: w.player.pitch, ...over }));
  }
}

/** yaw/pitch para mirar do olho do jogador até um ponto. */
export function aimAt(w: World, target: Vec3): { yaw: number; pitch: number } {
  const eye = eyePosition(w.player);
  const dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
  const l = Math.hypot(dx, dy, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.asin(dy / l) };
}

export function drain(w: World): World["events"] {
  return w.events.splice(0);
}
