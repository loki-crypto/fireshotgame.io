import { describe, expect, it } from "vitest";
import { registry } from "@fireshot/content";
import { computeDamage, counterKind, findEnemyDef, findWeaponDef, spawnEnemy, type EnemyStatus } from "../src";
import { aimAt, drain, makePhase, makeWorld, rows, run } from "./helpers";

const room = makePhase({
  layout: rows(
    "############",
    "#P.........#",
    "#..........#",
    "#..........#",
    "############",
  ),
  legend: { P: { type: "player" } },
  weaponsAvailable: ["patch_pistol", "scanner", "vpn_shield", "firewall_cannon", "sanitizer"],
});

const S = (...s: EnemyStatus[]) => new Set<EnemyStatus>(s);
const W = (id: string) => findWeaponDef(registry, id);
const E = (id: string) => findEnemyDef(registry, id);

describe("multiplicador ameaça ↔ contramedida", () => {
  it("contramedida correta ×2.5, incorreta ×0.5, arma base ×1", () => {
    expect(counterKind(W("firewall_cannon"), E("botnet_drone"), S())).toBe("strong");
    expect(counterKind(W("patch_pistol"), E("botnet_drone"), S())).toBe("neutral");
    expect(counterKind(W("sanitizer"), E("botnet_drone"), S())).toBe("weak");
    expect(counterKind(W("vpn_shield"), E("mitm"), S())).toBe("strong");
    expect(counterKind(W("sanitizer"), E("injector"), S())).toBe("strong");
    expect(counterKind(W("firewall_cannon"), E("injector"), S())).toBe("weak");
    expect(computeDamage(10, W("firewall_cannon"), E("botnet_drone"), S(), 1).damage).toBe(25);
    expect(computeDamage(10, W("sanitizer"), E("botnet_drone"), S(), 1).damage).toBe(5);
    expect(computeDamage(10, W("patch_pistol"), E("botnet_drone"), S(), 1).damage).toBe(10);
  });

  it("Worm: qualquer arma é neutra (exige prioridade, não contramedida)", () => {
    for (const w of registry.weapons) expect(counterKind(w, E("worm"), S())).toBe("neutral");
  });

  it("estados: Rootkit oculto ×0.5, revelado ×2.5 com qualquer arma", () => {
    expect(counterKind(W("patch_pistol"), E("rootkit"), S("hidden"))).toBe("weak");
    expect(counterKind(W("patch_pistol"), E("rootkit"), S("revealed"))).toBe("strong");
    expect(counterKind(W("firewall_cannon"), E("rootkit"), S("revealed"))).toBe("strong");
    expect(counterKind(W("patch_pistol"), E("bruteforcer"), S("locked_out"))).toBe("strong");
    expect(counterKind(W("patch_pistol"), E("bruteforcer"), S())).toBe("neutral");
  });

  it("blindagem do chefe reduz o dano até a erradicação", () => {
    const armored = computeDamage(10, W("patch_pistol"), E("ransomware"), S("armored"), 1).damage;
    expect(armored).toBeCloseTo(2);
    const exposed = computeDamage(10, W("patch_pistol"), E("ransomware"), S("exposed"), 1).damage;
    expect(exposed).toBe(25);
  });

  it("upgrade de dano multiplica o resultado", () => {
    expect(computeDamage(10, W("patch_pistol"), E("worm"), S(), 1.1).damage).toBeCloseTo(11);
  });
});

describe("armas do jogador", () => {
  it("Patch Pistol respeita cadência, consome pente e recarrega com reserva infinita", () => {
    const w = makeWorld(room);
    run(w, 1, { fire: true });
    const ws = w.player.weapons[0]!;
    // 3 tiros/s → ~3 tiros no primeiro segundo
    expect(12 - ws.magazine).toBeGreaterThanOrEqual(3);
    expect(12 - ws.magazine).toBeLessThanOrEqual(4);
    run(w, 5, { fire: true });
    expect(w.stats.shots).toBeGreaterThan(12);
    expect(ws.reserve).toBeNull();
  });

  it("recarga manual demora o tempo definido", () => {
    const w = makeWorld(room);
    run(w, 1, { fire: true });
    const ws = w.player.weapons[0]!;
    run(w, 1 / 60, { reload: true });
    expect(ws.reloading).toBe(true);
    run(w, 1.0, {});
    expect(ws.reloading).toBe(true);
    run(w, 0.3, {});
    expect(ws.reloading).toBe(false);
    expect(ws.magazine).toBe(12);
  });

  it("troca de arma por slot e cancela recarga", () => {
    const w = makeWorld(room);
    run(w, 1 / 60, { weaponSlot: 4 });
    expect(w.player.weapons[w.player.active]!.defId).toBe("firewall_cannon");
    run(w, 1 / 60, { weaponSlot: 2 });
    expect(w.player.weapons[w.player.active]!.defId).toBe("scanner");
    const ev = drain(w).filter((e) => e.type === "weapon_switch");
    expect(ev.length).toBe(2);
  });

  it("hitscan acerta inimigo à frente e aplica dano; parede bloqueia", () => {
    const w = makeWorld(room);
    const target = { x: 13, y: 0, z: 3 };
    const e = w.enemies.length;
    expect(e).toBe(0);
    const worm = spawnEnemy(w, "worm", target, { reason: "effect" });
    worm.state = "special"; // parado
    const aim = aimAt(w, { x: target.x, y: 0.45, z: target.z });
    run(w, 0.05, { fire: true, ...aim });
    expect(worm.hp).toBeLessThan(30);
    expect(w.stats.hits).toBe(1);
  });

  it("Scanner consome energia e revela inimigos no raio", () => {
    const w = makeWorld(room);
    const rk = spawnEnemy(w, "rootkit", { x: 9, y: 0, z: 5 }, { reason: "effect" });
    run(w, 1 / 60, { weaponSlot: 2 });
    run(w, 0.4, {});
    run(w, 1 / 60, { fire: true });
    expect(rk.revealedUntil).toBeGreaterThan(w.time);
    const scanner = w.player.weapons.find((x) => x.defId === "scanner")!;
    expect(scanner.energy).toBeLessThan(100);
  });
});
