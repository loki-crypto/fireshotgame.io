import { describe, expect, it } from "vitest";
import {
  applyTerminalResult, damageEnemy, findWeaponDef, interceptorOf, refreshStatuses, reportLatest, scannerPulse, spawnEnemy,
  createInboxMessage, encryptPlayer,
} from "../src";
import { registry } from "@fireshot/content";
import { aimAt, drain, makePhase, makeWorld, rows, run } from "./helpers";

const big = (extra: Partial<Parameters<typeof makePhase>[0]> = {}) => makePhase({
  layout: rows(
    "######################",
    "#P...................#",
    "#....................#",
    "#....................#",
    "#....................#",
    "#....................#",
    "#....................#",
    "######################",
  ),
  legend: { P: { type: "player" } },
  weaponsAvailable: ["patch_pistol", "scanner", "vpn_shield", "firewall_cannon", "sanitizer"],
  ...extra,
});

describe("Worm", () => {
  it("se replica a cada N segundos enquanto vivo, até o teto", () => {
    const w = makeWorld(big());
    const e = spawnEnemy(w, "worm", { x: 35, y: 0, z: 11 }, { reason: "effect" });
    e.data.replicateAt = 0.5;
    w.player.pos = { x: 3, y: 0, z: 3 };
    run(w, 1);
    expect(w.enemies.filter((x) => x.alive && x.type === "worm").length).toBe(2);
    expect(w.stats.wormReplications).toBe(1);
    run(w, 200);
    expect(w.enemies.filter((x) => x.alive && x.type === "worm").length).toBeLessThanOrEqual(8);
  });
});

describe("Rootkit", () => {
  it("oculto recebe ×0.5; Scanner revela e passa a receber ×2.5", () => {
    const w = makeWorld(big());
    const rk = spawnEnemy(w, "rootkit", { x: 20, y: 0, z: 8 }, { reason: "effect" });
    const pistol = findWeaponDef(registry, "patch_pistol");
    expect(refreshStatuses(w, rk).has("hidden")).toBe(true);
    const r1 = damageEnemy(w, rk, 10, pistol, rk.pos);
    expect(r1.counter).toBe("weak");
    expect(r1.damage).toBe(5);
    w.player.pos = { x: 18, y: 0, z: 8 };
    scannerPulse(w, 16, 6);
    const r2 = damageEnemy(w, rk, 10, pistol, rk.pos);
    expect(r2.counter).toBe("strong");
    expect(r2.damage).toBe(25);
    const revealEvents = drain(w).filter((e) => e.type === "enemy_revealed");
    expect(revealEvents.length).toBe(1);
  });

  it("abate revelado conta para o badge Caçador de Rootkits", () => {
    const w = makeWorld(big());
    const rk = spawnEnemy(w, "rootkit", { x: 20, y: 0, z: 8 }, { reason: "effect" });
    w.player.pos = { x: 18, y: 0, z: 8 };
    scannerPulse(w, 16, 6);
    damageEnemy(w, rk, 100, findWeaponDef(registry, "patch_pistol"), rk.pos);
    expect(w.stats.revealedKills.rootkit).toBe(1);
  });
});

describe("Trojan", () => {
  it("disfarçado não é alvo; ao se aproximar, embosca e conta como pickup falso", () => {
    const w = makeWorld(big());
    const tj = spawnEnemy(w, "trojan", { x: 13, y: 0, z: 3 }, { reason: "effect" });
    expect(tj.disguised).toBe(true);
    const aim = aimAt(w, { x: 13, y: 0.5, z: 3 });
    run(w, 0.4, { fire: true, ...aim });
    expect(tj.hp).toBe(tj.maxHp);
    w.player.pos = { x: 11.5, y: 0, z: 3 };
    run(w, 1 / 60);
    expect(tj.disguised).toBe(false);
    expect(w.stats.fakePickups).toBe(1);
    expect(w.player.shield).toBeLessThan(50);
    expect(w.outbox.some((e) => e.type === "pickup_collected" && e.fake)).toBe(true);
  });

  it("Scanner revela o disfarce antes da emboscada", () => {
    const w = makeWorld(big());
    const tj = spawnEnemy(w, "trojan", { x: 13, y: 0, z: 3 }, { reason: "effect" });
    scannerPulse(w, 16, 6);
    expect(tj.disguised).toBe(false);
    w.player.pos = { x: 11.5, y: 0, z: 3 };
    run(w, 1 / 60);
    expect(w.stats.fakePickups).toBe(0);
  });
});

describe("Botnet (DDoS)", () => {
  it("enxame próximo satura o jogador; Firewall Cannon elimina em área", () => {
    const w = makeWorld(big());
    for (let i = 0; i < 6; i++) spawnEnemy(w, "botnet_drone", { x: 20 + (i % 3), y: 0, z: 7 + Math.floor(i / 3) }, { reason: "effect" });
    w.player.pos = { x: 20, y: 0, z: 9 };
    run(w, 0.2);
    expect(w.player.saturated).toBe(true);
    const w2 = makeWorld(big());
    for (let i = 0; i < 5; i++) spawnEnemy(w2, "botnet_drone", { x: 30 + i * 0.6, y: 0, z: 8 }, { reason: "effect" }).state = "special";
    run(w2, 1 / 60, { weaponSlot: 4 });
    run(w2, 0.3);
    const aim = aimAt(w2, { x: 31.2, y: 1.1, z: 8 });
    run(w2, 1.5, { fire: true, ...aim });
    expect(w2.enemies.filter((e) => e.alive).length).toBe(0);
    expect(w2.stats.killsStrong).toBeGreaterThanOrEqual(5);
    expect(w2.barriers.length).toBe(1);
  });
});

describe("MITM", () => {
  const withTerminal = () => big({
    layout: rows(
      "######################",
      "#P...................#",
      "#....................#",
      "#..........T.........#",
      "#....................#",
      "#....................#",
      "#....................#",
      "######################",
    ),
    legend: { P: { type: "player" }, T: { type: "terminal", id: "t1" } },
    terminals: [{ id: "t1", title: "DNS", concept: "DNS", generator: "x", challenges: 1, required: true, onSolve: [] }],
  });

  it("intercepta terminal próximo; túnel VPN anula a interferência", () => {
    const w = makeWorld(withTerminal());
    const m = spawnEnemy(w, "mitm", { x: 18, y: 0, z: 11 }, { reason: "effect" });
    w.player.pos = { x: 23, y: 0, z: 12 };
    run(w, 2.5);
    expect(m.data.intercepting).toBe("t1");
    expect(interceptorOf(w, "t1")).toBe(m.id);
    // ergue a VPN Shield
    run(w, 1 / 60, { weaponSlot: 3 });
    run(w, 0.4);
    run(w, 0.2, { fire: true });
    expect(w.vpnTunnelUntil).toBeGreaterThan(w.time);
    expect(interceptorOf(w, "t1")).toBeNull();
  });

  it("resposta enviada sob interferência é registrada", () => {
    const w = makeWorld(withTerminal());
    applyTerminalResult(w, "t1", false, true);
    expect(w.stats.mitmInterference).toBe(1);
    expect(w.outbox.some((e) => e.type === "mitm_interference")).toBe(true);
  });

  it("VPN Shield bloqueia projéteis frontais", () => {
    const w = makeWorld(big());
    const m = spawnEnemy(w, "mitm", { x: 3, y: 0, z: 13 }, { reason: "effect" });
    m.state = "attack";
    run(w, 1 / 60, { weaponSlot: 3 });
    const aim = aimAt(w, { x: 3, y: 1.6, z: 13 });
    run(w, 3, { fire: true, ...aim });
    expect(drain(w).some((e) => e.type === "shield_block")).toBe(true);
  });
});

describe("Brute Forcer", () => {
  const vaultPhase = () => big({
    layout: rows(
      "######################",
      "#P...................#",
      "#....................#",
      "#....................#",
      "#....................#",
      "#..........V.........#",
      "#....................#",
      "######################",
    ),
    legend: { P: { type: "player" }, V: { type: "vault", id: "v1" } },
    vaults: [{ id: "v1", crackAttempts: 8, reward: { bytes: 30 } }],
  });

  it("sem bloqueio, quebra o cofre após N tentativas", () => {
    const w = makeWorld(vaultPhase());
    spawnEnemy(w, "bruteforcer", { x: 23, y: 0, z: 9 }, { reason: "effect" });
    run(w, 14);
    expect(w.vaults[0]!.cracked).toBe(true);
    expect(w.stats.vaultsCracked).toBe(1);
  });

  it("com a política de bloqueio, fica travado (×2.5) e não quebra o cofre", () => {
    const w = makeWorld(vaultPhase());
    w.flags.add("lockout");
    const bf = spawnEnemy(w, "bruteforcer", { x: 23, y: 0, z: 9 }, { reason: "effect" });
    let locked = false;
    run(w, 14, () => { if (bf.lockedOutUntil > w.time) locked = true; return {}; });
    expect(locked).toBe(true);
    expect(w.vaults[0]!.cracked).toBe(false);
    bf.lockedOutUntil = w.time + 5;
    const r = damageEnemy(w, bf, 10, findWeaponDef(registry, "patch_pistol"), bf.pos);
    expect(r.counter).toBe("strong");
  });
});

describe("Phisher e mensagens", () => {
  it("gera mensagem com isca; denunciar remove a isca e conta acerto", () => {
    const w = makeWorld(big());
    const msg = createInboxMessage(w, "phish", null)!;
    expect(msg).not.toBeNull();
    const pk = w.pickups.find((k) => k.id === msg.pickupId)!;
    expect(pk.fake).toBe(true);
    reportLatest(w);
    expect(pk.active).toBe(false);
    expect(w.stats.phishReported).toBe(1);
  });

  it("pegar a isca causa dano, zera escudo e conta pickup falso", () => {
    const w = makeWorld(big());
    const msg = createInboxMessage(w, "phish", null)!;
    const pk = w.pickups.find((k) => k.id === msg.pickupId)!;
    w.player.pos = { ...pk.pos };
    run(w, 1 / 60);
    expect(w.stats.fakePickups).toBe(1);
    expect(w.player.shield).toBe(0);
    expect(msg.resolved).toBe("taken");
  });

  it("denunciar mensagem legítima é falso positivo", () => {
    const w = makeWorld(big());
    createInboxMessage(w, "legit", null);
    reportLatest(w);
    expect(w.stats.phishFalsePositive).toBe(1);
  });

  it("Phisher envia mensagens periodicamente", () => {
    const w = makeWorld(big());
    spawnEnemy(w, "phisher", { x: 35, y: 0, z: 11 }, { reason: "effect" });
    run(w, 12);
    expect(w.inbox.some((m) => m.kind === "phish")).toBe(true);
  });
});

describe("Injector e Sanitizer", () => {
  const termPhase = () => big({
    layout: rows(
      "######################",
      "#P...................#",
      "#....................#",
      "#....................#",
      "#..........T.........#",
      "#....................#",
      "#....................#",
      "######################",
    ),
    legend: { P: { type: "player" }, T: { type: "terminal", id: "t1" } },
    terminals: [{ id: "t1", title: "Web", concept: "Validação", generator: "x", challenges: 1, required: true, onSolve: [] }],
  });

  it("corrompe terminal não resolvido; Sanitizer limpa mirando no console", () => {
    const w = makeWorld(termPhase());
    spawnEnemy(w, "injector", { x: 35, y: 0, z: 9 }, { reason: "effect" });
    w.player.pos = { x: 40, y: 0, z: 13 };
    run(w, 10);
    const t = w.terminals[0]!;
    expect(t.corrupted).toBe(true);
    w.enemies.forEach((e) => { e.alive = false; });
    w.player.pos = { x: 23, y: 0, z: 13 };
    run(w, 1 / 60, { weaponSlot: 5 });
    run(w, 0.4);
    const aim = aimAt(w, { x: 23, y: 0.9, z: 9.2 });
    run(w, 4, { fire: true, ...aim });
    expect(t.corrupted).toBe(false);
  });
});

describe("Ransomware", () => {
  it("criptografia remove upgrades e trava arma; Backup restaura", () => {
    const w = makeWorld(big(), 1, ["off_damage_1", "def_integrity_1"]);
    expect(w.mods.damageMult).toBeCloseTo(1.1);
    expect(w.player.maxHp).toBe(120);
    encryptPlayer(w, 20);
    expect(w.mods.damageMult).toBe(1);
    expect(w.player.maxHp).toBe(100);
    expect(w.player.weapons.some((x) => x.locked)).toBe(true);
    w.pickups.push({ id: "bk", kind: "backup", amount: 1, pos: { ...w.player.pos }, active: true, fake: false, revealed: false, source: "effect", messageId: null });
    run(w, 1 / 60);
    expect(w.mods.damageMult).toBeCloseTo(1.1);
    expect(w.player.weapons.some((x) => x.locked)).toBe(false);
  });

  it("pagar o resgate (tecla de denúncia) não restaura nada", () => {
    const w = makeWorld(big(), 1, ["off_damage_1"]);
    w.sessionBytes = 200;
    encryptPlayer(w, 20);
    run(w, 1 / 60, { report: true });
    expect(w.stats.ransomPaid).toBe(1);
    expect(w.sessionBytes).toBe(50);
    expect(w.mods.damageMult).toBe(1);
  });

  it("chefe é oculto e blindado até as flags do ciclo de resposta", () => {
    const w = makeWorld(big());
    const boss = spawnEnemy(w, "ransomware", { x: 30, y: 0, z: 8 }, { reason: "effect" });
    const pistol = findWeaponDef(registry, "patch_pistol");
    expect(damageEnemy(w, boss, 10, pistol, boss.pos).damage).toBeCloseTo(1);
    w.flags.add("identified");
    expect(damageEnemy(w, boss, 10, pistol, boss.pos).damage).toBeCloseTo(2);
    w.flags.add("eradicated");
    expect(damageEnemy(w, boss, 10, pistol, boss.pos).damage).toBe(25);
    boss.hp = 1;
    damageEnemy(w, boss, 10, pistol, boss.pos);
    expect(w.bossDefeated).toBe(true);
    expect(w.outbox.some((e) => e.type === "boss_defeated")).toBe(true);
  });
});
