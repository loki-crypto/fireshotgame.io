import { specialNum } from "../enemy";
import { basicAI, distToPlayer, seesPlayer, setState } from "../ai";
import { adjacentWalkable, faceToward, goToCell } from "../navigation";
import { emit, record, toast } from "../../world/world";
import type { Behavior } from "./types";

/**
 * Brute Forcer: ataca cofres com tentativas repetidas. Blindado (dano normal).
 * Com a política de bloqueio (flag "lockout", liberada no terminal de autenticação),
 * após N tentativas ele fica travado (locked_out) e recebe ×2.5.
 */
export const bruteforcerBehavior: Behavior = {
  onSpawn(_w, e) {
    e.data.windowAttempts = 0;
    e.data.attemptTimer = 0;
  },
  update(w, e, dt) {
    if (e.lockedOutUntil > w.time) {
      e.state = "special";
      e.data.wasLocked = true;
      return true;
    }
    if (e.data.wasLocked) {
      e.data.wasLocked = false;
      e.data.windowAttempts = 0;
      e.state = "chase";
    }

    // jogador perto e visível: defende-se
    if (distToPlayer(w, e) < specialNum(e.def, "aggroRadius", 5) && seesPlayer(w, e, 6)) {
      if (e.state === "patrol") setState(w, e, "chase");
      basicAI(w, e, dt);
      return true;
    }
    const vault = w.vaults
      .filter((v) => !v.cracked)
      .sort((a, b) => Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) - Math.hypot(b.pos.x - e.pos.x, b.pos.z - e.pos.z))[0];
    if (!vault) return false;
    const stand = adjacentWalkable(w.grid, vault.cell, e.pos);
    if (!stand) return false;
    const standPos = w.grid.cellToWorld(stand);
    if (Math.hypot(standPos.x - e.pos.x, standPos.z - e.pos.z) > 0.6) {
      goToCell(w, e, stand, e.def.speed, dt);
      e.state = "chase";
      return true;
    }
    faceToward(e, vault.pos);
    e.state = "special";
    e.data.attemptTimer = (e.data.attemptTimer as number) - dt;
    if ((e.data.attemptTimer as number) <= 0) {
      e.data.attemptTimer = specialNum(e.def, "attemptInterval", 1.1);
      vault.attempts++;
      e.data.windowAttempts = (e.data.windowAttempts as number) + 1;
      emit(w, { type: "vault_attempt", vaultId: vault.id, attempts: vault.attempts });
      if (w.flags.has("lockout") && (e.data.windowAttempts as number) >= specialNum(e.def, "lockoutAfter", 5)) {
        e.lockedOutUntil = w.time + specialNum(e.def, "lockoutSeconds", 7);
        e.data.windowAttempts = 0;
        emit(w, { type: "lockout", enemyId: e.id });
        toast(w, "Bloqueio por tentativas ativado: Brute Forcer travado e vulnerável (×2.5)!", "success");
      } else if (vault.attempts >= vault.def.crackAttempts) {
        vault.cracked = true;
        w.stats.vaultsCracked++;
        emit(w, { type: "vault_cracked", vaultId: vault.id });
        record(w, { type: "vault_cracked", t: w.time, vault: vault.id });
        toast(w, "Cofre quebrado por força bruta: sem limite de tentativas, toda senha cai com tempo.", "danger");
      }
    }
    return true;
  },
  statuses(w, e, out) {
    if (e.lockedOutUntil > w.time) out.add("locked_out");
  },
};
