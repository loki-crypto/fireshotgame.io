import { mulberry32 } from "../core/rng";
import { CELL_CONSOLE, CELL_DOOR, CELL_VAULT, Grid, raycastGrid, type Cell } from "../core/grid";
import { findWeaponDef, type ContentRegistry, type LegendEntry, type SpawnerDef } from "../core/types";
import { createPlayer } from "../player/player";
import { computeModifiers } from "../progression/modifiers";
import { createWeaponState } from "../weapons/weapon";
import { addPickup } from "../phase/pickups";
import { emptyStats, type ArenaState, type Door, type Spawner, type TerminalEntity, type Vault, type Zone } from "./entities";
import { spawnEnemy } from "./spawn";
import { saveCheckpoint } from "./checkpoint";
import type { MessageFactory, World } from "./world";
import { distanceField } from "../enemies/navigation";

export interface CreateWorldOptions {
  reg: ContentRegistry;
  phaseId: string;
  seed: number;
  equippedUpgrades?: string[];
  messageFactory?: MessageFactory | null;
}

/** Direção (yaw) com maior espaço livre a partir de um ponto — usada para orientar o jogador no início. */
function openYaw(grid: Grid, x: number, z: number): number {
  let best = 0;
  let bestD = -1;
  for (let i = 0; i < 8; i++) {
    const yaw = (i / 8) * Math.PI * 2;
    const dir = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    const hit = raycastGrid(grid, { x, y: 1.6, z }, dir, 60);
    const d = hit ? hit.distance : 60;
    if (d > bestD + 0.01) { bestD = d; best = yaw; }
  }
  return best;
}

export function createWorld(opts: CreateWorldOptions): World {
  const { reg } = opts;
  const phase = reg.phases.find((p) => p.id === opts.phaseId);
  if (!phase) throw new Error(`phase not found: ${opts.phaseId}`);
  const grid = new Grid(phase.layout.rows, phase.layout.cellSize, phase.layout.wallHeight);
  const equipped = opts.equippedUpgrades ?? [];
  const mods = computeModifiers(reg.upgrades, equipped);

  const weaponIds = [...phase.weaponsAvailable].sort((a, b) => findWeaponDef(reg, a).slot - findWeaponDef(reg, b).slot);
  const weapons = weaponIds.map((id) => createWeaponState(findWeaponDef(reg, id), mods));

  let start: Cell | null = null;
  const doors = new Map<string, Door>();
  const terminals: TerminalEntity[] = [];
  const spawners: Spawner[] = [];
  const zones = new Map<string, Zone>();
  const vaults: Vault[] = [];
  const signs: World["signs"] = [];
  const layoutEnemies: { entry: Extract<LegendEntry, { type: "enemy" }>; cell: Cell }[] = [];
  const layoutPickups: { entry: Extract<LegendEntry, { type: "pickup" }>; cell: Cell }[] = [];

  for (const { glyph, cell } of grid.glyphs) {
    const entry = phase.legend[glyph];
    if (!entry) throw new Error(`phase ${phase.id}: glyph '${glyph}' at ${cell} not in legend`);
    const [c, r] = cell;
    const pos = grid.cellToWorld(cell);
    switch (entry.type) {
      case "player": start = cell; break;
      case "door": {
        grid.set(c, r, CELL_DOOR);
        const d = doors.get(entry.id) ?? { id: entry.id, cells: [], open: false, amount: 0 };
        d.cells.push(cell);
        doors.set(entry.id, d);
        break;
      }
      case "terminal": {
        const def = phase.terminals.find((t) => t.id === entry.id);
        if (!def) throw new Error(`phase ${phase.id}: terminal ${entry.id} not defined`);
        grid.set(c, r, CELL_CONSOLE);
        terminals.push({
          id: def.id, def, cell, pos, facing: { x: 0, z: 1 }, solvedChallenges: 0, attemptsOnChallenge: 0,
          totalAttempts: 0, solved: false, firstTry: true, corrupted: false, cleanProgress: 0,
        });
        break;
      }
      case "enemy": layoutEnemies.push({ entry, cell }); break;
      case "spawner": {
        const def: SpawnerDef = phase.spawners?.find((s) => s.id === entry.id) ?? { id: entry.id };
        spawners.push({ id: entry.id, def, cell, pos, active: def.active ?? true, timer: def.every ?? 0, alive: [] });
        break;
      }
      case "pickup": layoutPickups.push({ entry, cell }); break;
      case "arena":
      case "exit":
      case "trigger": {
        const id = entry.type === "exit" ? "exit" : entry.id;
        const z = zones.get(id) ?? { id, type: entry.type, cells: new Set<number>(), fired: false };
        z.cells.add(grid.cellIndex(c, r));
        zones.set(id, z);
        break;
      }
      case "vault": {
        const def = phase.vaults?.find((v) => v.id === entry.id);
        if (!def) throw new Error(`phase ${phase.id}: vault ${entry.id} not defined`);
        grid.set(c, r, CELL_VAULT);
        vaults.push({ id: def.id, def, cell, pos, attempts: 0, cracked: false });
        break;
      }
      case "sign": signs.push({ text: entry.text, pos, cell }); break;
    }
  }
  if (!start) throw new Error(`phase ${phase.id}: no player start`);

  // orientação dos consoles: para o lado caminhável
  for (const t of terminals) {
    const dirs: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const open = dirs.find(([dc, dr]) => grid.isWalkable(t.cell[0] + dc, t.cell[1] + dr));
    if (open) t.facing = { x: open[0], z: open[1] };
  }

  const startPos = grid.cellToWorld(start);
  const startYaw = openYaw(grid, startPos.x, startPos.z);
  const player = createPlayer(startPos, startYaw, weapons, 100 + mods.maxHpAdd, 50 + mods.maxShieldAdd);

  const arenas: ArenaState[] = (phase.arenas ?? []).map((def) => ({ id: def.id, def, state: "idle", wave: -1, pending: [], alive: [], delay: -1 }));

  const w: World = {
    reg, phase, seed: opts.seed >>> 0, rng: mulberry32(opts.seed ^ 0x9e3779b9), time: 0, tick: 0,
    grid, player, playerStart: { pos: startPos, yaw: startYaw },
    enemies: [], pickups: [], terminals, doors: [...doors.values()], spawners, arenas, zones: [...zones.values()],
    vaults, signs, projectiles: [], barriers: [], inbox: [], flags: new Set(),
    firewall: phase.firewall?.initial ?? { defaultPolicy: "allow", rules: [] }, pendingFirewall: null,
    upgradeMods: mods, mods: { ...mods }, equippedUpgrades: equipped, weaponsAvailable: weaponIds,
    encryptedUntil: 0, encryptWarnUntil: 0, vpnTunnelUntil: 0,
    checkpoint: null, backupAvailable: true, mfaAvailable: true,
    status: "playing", deathCause: null, bossId: null, bossDefeated: false, exitOpen: false,
    sessionBytes: 0, stats: emptyStats(), lastDamageSource: null, focusTerminal: null,
    events: [], outbox: [], nextId: 0,
    nav: { field: new Float32Array(0), fieldCell: -1, fieldVersion: -1, fieldTime: -1 },
    messageFactory: opts.messageFactory ?? null,
    legitTimer: phase.messages?.legitEvery ? phase.messages.legitEvery * 0.4 : 0,
  };

  for (const { entry, cell } of layoutEnemies) {
    const route = entry.route ? (phase.routes?.[entry.route] ?? []).map((c) => [c[0], c[1]] as Cell) : [];
    spawnEnemy(w, entry.enemy, grid.cellToWorld(cell), { reason: "layout", route });
  }
  for (const { entry, cell } of layoutPickups) {
    addPickup(w, entry.kind, grid.cellToWorld(cell), { amount: entry.amount, fake: entry.fake ?? false, source: "layout" });
  }
  w.nav.field = distanceField(grid, start);
  saveCheckpoint(w, "start");
  w.events = [];
  return w;
}
