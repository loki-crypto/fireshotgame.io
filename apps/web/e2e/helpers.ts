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

/** Pula o briefing, inicia a missão e simula a captura do ponteiro. */
export async function startMission(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Pular" }).click();
  await page.getByRole("button", { name: /Iniciar missão/ }).click();
  await page.waitForFunction(() => window.__fireshot?.mode() === "playing");
  await page.evaluate(() => window.__fireshot!.forceLock());
}

export async function mode(page: Page): Promise<string> {
  return page.evaluate(() => window.__fireshot?.mode() ?? "none");
}

export async function expectMode(page: Page, expected: string): Promise<void> {
  await expect.poll(() => mode(page)).toBe(expected);
}
