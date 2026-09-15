import { specialNum, specialStr } from "../enemy";
import { fireProjectile, seesPlayer } from "../ai";
import { faceToward, moveToward } from "../navigation";
import { emit, record, toast } from "../../world/world";
import { spawnEnemy } from "../../world/spawn";
import { decryptPlayer, encryptPlayer } from "../../world/encryption";
import type { RangedAttack } from "../../core/types";
import type { Behavior } from "./types";

/**
 * Ransomware (chefe): "criptografa" os upgrades do jogador periodicamente.
 * Oculto até a fase "identificar"; blindado até "erradicar"; invoca reforços até "conter".
 */
export const ransomwareBehavior: Behavior = {
  onSpawn(w, e) {
    w.bossId = e.id;
    e.data.volley = 3;
    e.data.encrypt = specialNum(e.def, "encryptEvery", 20);
    e.data.summon = specialNum(e.def, "summonEvery", 22);
    e.data.warned = false;
    e.state = "special";
  },
  statuses(w, _e, out) {
    if (!w.flags.has("identified")) out.add("hidden");
    if (!w.flags.has("eradicated")) out.add("armored");
    else out.add("exposed");
  },
  update(w, e, dt) {
    const p = w.player;
    if (!p.alive) return true;
    const enraged = e.hp < e.maxHp * 0.5;
    const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    // deriva lenta perto de casa, encarando o jogador
    const orbit = w.time * 0.25;
    const target = { x: e.home.x + Math.cos(orbit) * 2.5, y: 0, z: e.home.z + Math.sin(orbit) * 2.5 };
    moveToward(w, e, target, e.def.speed * (enraged ? 1.4 : 1), dt);
    faceToward(e, p.pos);

    const sees = seesPlayer(w, e, 40);
    const atk = e.def.attack as RangedAttack;
    e.data.volley = (e.data.volley as number) - dt;
    if (sees && (e.data.volley as number) <= 0 && d < atk.range) {
      e.data.volley = atk.cooldown * (enraged ? 0.6 : 1);
      const n = enraged ? 5 : 3;
      for (let i = 0; i < n; i++) fireProjectile(w, e, atk, (i - (n - 1) / 2) * 0.12);
    }

    e.data.encrypt = (e.data.encrypt as number) - dt;
    if ((e.data.encrypt as number) <= 1.5 && !e.data.warned) {
      e.data.warned = true;
      w.encryptWarnUntil = w.time + 1.5;
      emit(w, { type: "encrypt_warning", seconds: 1.5 });
    }
    if ((e.data.encrypt as number) <= 0) {
      e.data.encrypt = specialNum(e.def, "encryptEvery", 20) * (enraged ? 0.75 : 1);
      e.data.warned = false;
      if (sees && w.encryptedUntil <= w.time) encryptPlayer(w, specialNum(e.def, "encryptSeconds", 22));
    }

    if (!w.flags.has("contained")) {
      e.data.summon = (e.data.summon as number) - dt;
      if ((e.data.summon as number) <= 0) {
        e.data.summon = specialNum(e.def, "summonEvery", 22);
        const enemy = specialStr(e.def, "summonEnemy", "worm");
        const count = specialNum(e.def, "summonCount", 2);
        const spawners = w.spawners.filter((s) => s.id.startsWith("boss"));
        for (let i = 0; i < count && spawners.length > 0; i++) {
          const sp = spawners[i % spawners.length]!;
          const minion = spawnEnemy(w, enemy, sp.pos, { reason: "spawner", spawnerId: sp.id, arenaId: e.arenaId });
          minion.state = "chase";
        }
        toast(w, "O Ransomware invocou reforços pela rede. Contenha o incidente (isolar segmentos)!", "warn");
      }
    }
    return true;
  },
  onDeath(w, e) {
    w.bossDefeated = true;
    emit(w, { type: "boss_defeated", enemyId: e.id });
    record(w, { type: "boss_defeated", t: w.time, boss: e.type });
    decryptPlayer(w);
    toast(w, "Ransomware erradicado! Conclua a recuperação e siga para a saída.", "success");
  },
};
