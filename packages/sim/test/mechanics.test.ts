import { describe, expect, it } from "vitest";
import { pools } from "@fireshot/content";
import {
  createInboxMessage, damageEnemy, findWeaponDef, makeInboxMessage, mulberry32, reportLatest, stepWorld, type World,
} from "../src";
import { aimAt, drain, input, makePhase, makeWorld, rows } from "./helpers";

const flat = makePhase({
  layout: rows(
    "#########",
    "#P......#",
    "#.......#",
    "#.......#",
    "#########",
  ),
  legend: { P: { type: "player" } },
  messages: { legitEvery: 10, maxActive: 3 },
  tags: ["practice", "fake_pickups"],
});

function worldWithMessages(seed = 3): World {
  const w = makeWorld(flat, seed);
  w.messageFactory = (rng, kind) => makeInboxMessage(rng, kind, pools);
  return w;
}

describe("caixa de entrada (phishing)", () => {
  it("o gerador usa o banco de mensagens e marca os sinais", () => {
    const phish = makeInboxMessage(mulberry32(1), "phish", pools);
    const legit = makeInboxMessage(mulberry32(1), "legit", pools);
    expect(phish.from).not.toBe(legit.from);
    expect(phish.signals.length).toBeGreaterThan(0);
    expect(legit.from).toContain("@redecorp.com.br");
    expect(makeInboxMessage(mulberry32(9), "phish", pools)).toEqual(makeInboxMessage(mulberry32(9), "phish", pools));
  });

  it("isca de phishing cria um pickup falso; denunciar remove a isca e conta acerto", () => {
    const w = worldWithMessages();
    const msg = createInboxMessage(w, "phish", null);
    expect(msg).not.toBeNull();
    const pickup = w.pickups.find((p) => p.id === msg!.pickupId)!;
    expect(pickup.fake).toBe(true);

    reportLatest(w);
    expect(msg!.resolved).toBe("reported");
    expect(pickup.active).toBe(false);
    expect(w.stats.phishReported).toBe(1);
    expect(w.stats.phishFalsePositive).toBe(0);
    expect(w.outbox.filter((e) => e.type === "phish_reported" && e.correct)).toHaveLength(1);
  });

  it("denunciar mensagem legítima descarta o suprimento e conta falso positivo", () => {
    const w = worldWithMessages(11);
    const msg = createInboxMessage(w, "legit", null)!;
    const pickup = w.pickups.find((p) => p.id === msg.pickupId)!;
    expect(pickup.fake).toBe(false);

    reportLatest(w);
    expect(w.stats.phishFalsePositive).toBe(1);
    expect(w.stats.phishReported).toBe(0);
    expect(pickup.active).toBe(false);
    expect(w.outbox.filter((e) => e.type === "phish_reported" && !e.correct)).toHaveLength(1);
  });

  it("mensagem não resolvida expira e a isca desaparece", () => {
    const w = worldWithMessages(5);
    const msg = createInboxMessage(w, "phish", null)!;
    const pickup = w.pickups.find((p) => p.id === msg.pickupId)!;
    for (let i = 0; i < 60 * 40; i++) stepWorld(w, input({ yaw: w.player.yaw, pitch: w.player.pitch }));
    expect(msg.resolved).toBe("expired");
    expect(pickup.active).toBe(false);
  });

  it("pegar a isca conta como pickup falso", () => {
    const w = worldWithMessages(7);
    const msg = createInboxMessage(w, "phish", null)!;
    const pickup = w.pickups.find((p) => p.id === msg.pickupId)!;
    w.player.pos = { x: pickup.pos.x, y: 0, z: pickup.pos.z };
    w.player.prevPos = { ...w.player.pos };
    stepWorld(w, input({ yaw: w.player.yaw, pitch: w.player.pitch }));
    expect(w.stats.fakePickups).toBe(1);
    expect(w.outbox.some((e) => e.type === "pickup_collected" && e.fake)).toBe(true);
  });
});

describe("Trojan disfarçado", () => {
  const phase = makePhase({
    layout: rows("#######", "#P....#", "#..j..#", "#######"),
    legend: { P: { type: "player" }, j: { type: "enemy", enemy: "trojan" } },
    weaponsAvailable: ["patch_pistol", "scanner"],
    tags: ["practice", "fake_pickups"],
  });

  it("nasce disfarçado e emboscada ao chegar perto", () => {
    const w = makeWorld(phase, 1);
    const trojan = w.enemies[0]!;
    expect(trojan.disguised).toBe(true);
    w.player.pos = { x: trojan.pos.x + 1, y: 0, z: trojan.pos.z };
    w.player.prevPos = { ...w.player.pos };
    stepWorld(w, input({ yaw: w.player.yaw, pitch: w.player.pitch }));
    expect(trojan.disguised).toBe(false);
    expect(w.stats.fakePickups).toBe(1);
    expect(w.player.hp + w.player.shield).toBeLessThan(w.player.maxHp + w.player.maxShield);
    expect(drain(w).some((e) => e.type === "trojan_ambush")).toBe(true);
  });

  it("revelado pelo Scanner recebe dano ×2.5", () => {
    const w = makeWorld(phase, 1);
    const trojan = w.enemies[0]!;
    const pistol = findWeaponDef(w.reg, "patch_pistol");
    const hidden = damageEnemy(w, trojan, 10, pistol, { ...trojan.pos });
    expect(hidden.counter).toBe("neutral");

    trojan.revealedUntil = w.time + 5;
    const revealed = damageEnemy(w, trojan, 10, pistol, { ...trojan.pos });
    expect(revealed.counter).toBe("strong");
    expect(revealed.damage).toBeCloseTo(hidden.damage * 2.5, 5);
  });
});

describe("Injector e Sanitizer", () => {
  const phase = makePhase({
    layout: rows("#########", "#P.....T#", "#.......#", "#..n....#", "#########"),
    legend: {
      P: { type: "player" },
      T: { type: "terminal", id: "t1" },
      n: { type: "enemy", enemy: "injector" },
    },
    weaponsAvailable: ["patch_pistol", "sanitizer"],
    terminals: [{ id: "t1", title: "Teste", concept: "Teste", generator: "mc_pool", params: { pool: "injection" }, challenges: 1, required: true, onSolve: [] }],
    exit: { requires: { terminals: ["t1"] } },
  });

  it("o Injector corrompe o terminal e o Sanitizer limpa", () => {
    const w = makeWorld(phase, 2);
    const terminal = w.terminals[0]!;
    // o injector precisa de tempo sem levar dano para concluir a injeção
    for (let i = 0; i < 60 * 30 && !terminal.corrupted; i++) {
      w.player.pos = { x: 2, y: 0, z: 2 };
      w.player.prevPos = { ...w.player.pos };
      stepWorld(w, input({ yaw: w.player.yaw, pitch: w.player.pitch }));
    }
    expect(terminal.corrupted, "o Injector deveria corromper o terminal").toBe(true);

    // Sanitizer aponta para o console e limpa a corrupção
    w.enemies.forEach((e) => { e.alive = false; });
    w.player.pos = { x: terminal.pos.x - 2.5, y: 0, z: terminal.pos.z };
    w.player.prevPos = { ...w.player.pos };
    const aim = aimAt(w, { x: terminal.pos.x, y: 1.0, z: terminal.pos.z });
    for (let i = 0; i < 60 * 8 && terminal.corrupted; i++) {
      stepWorld(w, input({ ...aim, fire: true, weaponSlot: 5 }));
    }
    expect(terminal.corrupted, "o Sanitizer deveria limpar o terminal").toBe(false);
    expect(terminal.cleanProgress).toBe(0);
  });

  it("o Sanitizer é a contramedida forte do Injector", () => {
    const w = makeWorld(phase, 2);
    const injector = w.enemies[0]!;
    const sanitizer = findWeaponDef(w.reg, "sanitizer");
    const pistol = findWeaponDef(w.reg, "patch_pistol");
    expect(damageEnemy(w, injector, 10, pistol, { ...injector.pos }).counter).toBe("neutral");
    expect(damageEnemy(w, injector, 10, sanitizer, { ...injector.pos }).counter).toBe("strong");
  });
});

describe("chefe Ransomware", () => {
  const phase = makePhase({
    layout: rows("###########", "#P.......b#", "#....R....#", "#.........#", "###########"),
    legend: {
      P: { type: "player" },
      R: { type: "enemy", enemy: "ransomware" },
      b: { type: "spawner", id: "boss1" },
    },
    spawners: [{ id: "boss1" }],
    weaponsAvailable: ["patch_pistol"],
    exit: { requires: { bossDefeated: true } },
    parTime: 600,
  });

  it("oculto e blindado até identificar e erradicar", () => {
    const world = makeWorld(phase, 1);
    const boss = world.enemies.find((e) => e.id === world.bossId)!;
    const pistol = findWeaponDef(world.reg, "patch_pistol");

    const hidden = damageEnemy(world, boss, 100, pistol, { ...boss.pos });
    expect(hidden.counter).toBe("weak");

    world.flags.add("identified");
    const identified = damageEnemy(world, boss, 100, pistol, { ...boss.pos });
    expect(identified.counter).toBe("neutral");
    expect(identified.damage).toBeLessThan(100); // blindagem

    world.flags.add("eradicated");
    const exposed = damageEnemy(world, boss, 100, pistol, { ...boss.pos });
    expect(exposed.counter).toBe("strong");
    expect(exposed.damage).toBeGreaterThan(identified.damage);
  });

  it("invoca reforços até ser contido", () => {
    const world = makeWorld(phase, 1);
    const before = world.enemies.length;
    for (let i = 0; i < 60 * 30; i++) stepWorld(world, input({ yaw: world.player.yaw, pitch: world.player.pitch }));
    expect(world.enemies.length, "sem conter, o chefe traz reforços").toBeGreaterThan(before);

    world.flags.add("contained");
    const contained = world.enemies.length;
    for (let i = 0; i < 60 * 40; i++) stepWorld(world, input({ yaw: world.player.yaw, pitch: world.player.pitch }));
    expect(world.enemies.length, "contido, para de invocar").toBe(contained);
  });

  it("morte do chefe libera a saída e descriptografa os upgrades", () => {
    const world = makeWorld(phase, 1);
    const boss = world.enemies.find((e) => e.id === world.bossId)!;
    world.flags.add("identified");
    world.flags.add("eradicated");
    world.encryptedUntil = world.time + 30;
    for (let i = 0; i < 400 && boss.alive; i++) damageEnemy(world, boss, 200, findWeaponDef(world.reg, "patch_pistol"), { ...boss.pos });
    expect(boss.alive).toBe(false);
    expect(world.bossDefeated).toBe(true);
    expect(world.encryptedUntil).toBeLessThanOrEqual(world.time);
    expect(world.outbox.some((e) => e.type === "boss_defeated" && e.boss === "ransomware")).toBe(true);
  });
});
