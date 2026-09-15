import { emit, portAllowed, toast, type World } from "../world/world";
import { applyEffects, closeDoor, openDoor } from "../world/effects";
import { spawnEnemy } from "../world/spawn";
import type { ArenaState } from "../world/entities";

export function startArena(w: World, a: ArenaState): void {
  if (a.state !== "idle") return;
  a.state = "active";
  a.wave = -1;
  for (const d of a.def.lockDoors ?? []) closeDoor(w, d);
  emit(w, { type: "arena_started", arenaId: a.id });
  toast(w, `Arena: ${a.def.title}`, "warn");
  nextWave(w, a);
}

function nextWave(w: World, a: ArenaState): void {
  a.wave++;
  const wave = a.def.waves[a.wave];
  if (!wave) {
    a.state = "cleared";
    for (const d of a.def.lockDoors ?? []) openDoor(w, d);
    emit(w, { type: "arena_cleared", arenaId: a.id });
    applyEffects(w, a.def.onClear);
    return;
  }
  a.pending = wave.spawns.map((s) => ({ ...s, remaining: s.count, timer: 0 }));
  a.delay = -1;
  emit(w, { type: "arena_wave", arenaId: a.id, wave: a.wave });
  if (wave.message) toast(w, wave.message, "warn");
}

export function stepArenas(w: World, dt: number): void {
  for (const a of w.arenas) {
    if (a.state !== "active") continue;
    for (const ps of a.pending) {
      if (ps.remaining <= 0) continue;
      ps.timer -= dt;
      if (ps.timer > 0) continue;
      ps.timer = ps.interval ?? 0.7;
      ps.remaining--;
      const sp = w.spawners.find((s) => s.id === ps.spawner);
      if (!sp) continue;
      const port = ps.traffic ?? sp.def.traffic;
      if (port !== undefined && !portAllowed(w.firewall, port)) {
        w.stats.spawnsBlocked++;
        emit(w, { type: "spawn_blocked", pos: { ...sp.pos }, port });
        continue;
      }
      const jitter = { x: (w.rng.next() - 0.5) * 0.8, z: (w.rng.next() - 0.5) * 0.8 };
      const e = spawnEnemy(w, ps.enemy, { x: sp.pos.x + jitter.x, y: 0, z: sp.pos.z + jitter.z }, { reason: "wave", arenaId: a.id, spawnerId: sp.id, traffic: port ?? null });
      if (e.behavior !== "trojan") { e.state = "chase"; }
    }
    const pendingLeft = a.pending.some((p) => p.remaining > 0);
    const alive = w.enemies.some((e) => e.alive && e.arenaId === a.id);
    if (!pendingLeft && !alive) {
      if (a.delay < 0) a.delay = a.def.waves[a.wave]?.delayAfter ?? 1.5;
      a.delay -= dt;
      if (a.delay <= 0) nextWave(w, a);
    }
  }
}

export function stepSpawners(w: World, dt: number): void {
  for (const s of w.spawners) {
    if (!s.active || !s.def.enemy || !s.def.every) continue;
    s.timer -= dt;
    if (s.timer > 0) continue;
    s.timer = s.def.every;
    s.alive = s.alive.filter((id) => w.enemies.some((e) => e.id === id && e.alive));
    if (s.alive.length >= (s.def.max ?? 3)) continue;
    if (s.def.traffic !== undefined && !portAllowed(w.firewall, s.def.traffic)) {
      w.stats.spawnsBlocked++;
      emit(w, { type: "spawn_blocked", pos: { ...s.pos }, port: s.def.traffic });
      continue;
    }
    const e = spawnEnemy(w, s.def.enemy, s.pos, { reason: "spawner", spawnerId: s.id, traffic: s.def.traffic ?? null });
    s.alive.push(e.id);
  }
}
