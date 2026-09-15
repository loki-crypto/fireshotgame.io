import { baseModifiers } from "../progression/modifiers";
import { emit, newId, toast, type World } from "./world";

/** Ransomware "criptografa" os upgrades e trava uma arma especial até expirar ou até um Backup ser coletado. */
export function encryptPlayer(w: World, seconds: number): void {
  w.encryptedUntil = w.time + seconds;
  w.mods = baseModifiers();
  applyModsToPlayer(w);
  const candidates = w.player.weapons
    .map((ws, i) => ({ ws, i }))
    .filter(({ ws }) => !w.reg.weapons.find((d) => d.id === ws.defId)?.base);
  if (candidates.length > 0) {
    const { ws } = w.rng.pick(candidates);
    ws.locked = true;
  }
  w.inbox.push({
    id: newId(w, "m"), kind: "ransom", from: "LockBit-Clone <sem-retorno@anon>",
    subject: "SEUS UPGRADES FORAM CRIPTOGRAFADOS",
    body: "Pague 150 bytes para receber a chave. Você tem pouco tempo.",
    signals: [
      "Pagar resgate não garante a recuperação dos dados.",
      "O pagamento financia novos ataques.",
      "A resposta correta é restaurar a partir de um backup íntegro.",
    ],
    createdAt: w.time, expiresAt: w.encryptedUntil, pickupId: null, enemyId: w.bossId, resolved: "open",
  });
  emit(w, { type: "encrypted", seconds });
  emit(w, { type: "inbox", messageId: w.inbox[w.inbox.length - 1]!.id, kind: "ransom" });
  toast(w, "Upgrades criptografados! Colete um Backup (disco branco) para restaurar.", "danger");
}

export function decryptPlayer(w: World): void {
  if (w.encryptedUntil <= 0) return;
  w.encryptedUntil = 0;
  for (const ws of w.player.weapons) ws.locked = false;
  w.mods = { ...w.upgradeMods };
  applyModsToPlayer(w);
  for (const m of w.inbox) if (m.kind === "ransom" && m.resolved === "open") m.resolved = "expired";
  emit(w, { type: "decrypted" });
}

/** Aplica limites derivados dos modificadores (integridade e escudo máximos). */
export function applyModsToPlayer(w: World): void {
  const p = w.player;
  p.maxHp = 100 + w.mods.maxHpAdd;
  p.maxShield = 50 + w.mods.maxShieldAdd;
  p.hp = Math.min(p.hp, p.maxHp);
  p.shield = Math.min(p.shield, p.maxShield);
}
