import { expect, type Page } from "@playwright/test";

/** Ganchos expostos por GameSession.debugApi() quando VITE_E2E=1. */
export interface FireshotDebug {
  mode(): string;
  forceLock(): void;
  solveAll(): void;
  answerAll(): Promise<void>;
  clearArenas(): void;
  defeatBoss(): void;
  finish(): void;
  hurt(amount: number, source?: string | null): void;
  openTerminal(id: string): void;
  teleport(x: number, z: number): void;
}

declare global {
  interface Window { __fireshot?: FireshotDebug & Record<string, unknown> }
}

export async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // falhas de rede do /api sem backend são esperadas no modo sem conta
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/**
 * Pula o briefing, inicia a missão e simula a captura do ponteiro.
 * O briefing redesenha enquanto digita as falas, então "Pular" pode já ter desaparecido
 * e o botão de início pode ser substituído entre a busca e o clique: insiste até jogar.
 */
export async function startMission(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Pular" });
  const start = page.getByRole("button", { name: /Iniciar missão/ });
  await expect
    .poll(async () => {
      const current = await mode(page);
      if (current === "playing") return current;
      if (await start.isVisible().catch(() => false)) await start.click().catch(() => {});
      else if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
      return mode(page);
    }, { timeout: 60_000 })
    .toBe("playing");
  await page.evaluate(() => window.__fireshot!.forceLock());
}

export async function mode(page: Page): Promise<string> {
  return page.evaluate(() => window.__fireshot?.mode() ?? "none");
}

export async function expectMode(page: Page, expected: string): Promise<void> {
  await expect.poll(() => mode(page)).toBe(expected);
}
