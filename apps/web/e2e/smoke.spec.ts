import { devices, expect, test } from "@playwright/test";
import { collectErrors, expectMode, startMission } from "./helpers";

test("menu carrega com as opções principais", async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto("/");
  await expect(page.getByText("FIRESHOT")).toBeVisible();
  await expect(page.getByRole("button", { name: /Experimentar o tutorial/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Laboratório de treino/ })).toBeVisible();
  // tela de título: escolha de agente e a campanha inteira
  await expect(page.getByRole("radiogroup", { name: "Escolha seu agente" }).getByRole("radio")).toHaveCount(8);
  await page.getByRole("radio", { name: /Androide/ }).click();
  await expect(page.getByRole("img", { name: "Androide" })).toBeVisible();
  await expect(page.locator(".campaign-stop")).toHaveCount(10);
  await expect(page.getByRole("note")).toHaveCount(0); // computador: sem aviso de celular
  await expect(page.getByRole("link", { name: "Contato" })).toHaveAttribute("href", "mailto:fireshotIO@gmail.com");
  expect(errors).toEqual([]);
});

test("laboratório renderiza o canvas e responde a movimento", async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Laboratório de treino/ }).click();
  await expect(page.getByRole("dialog", { name: "Briefing" })).toBeVisible();
  await expect(page.locator("canvas.game-canvas")).toHaveCount(1);
  await startMission(page);
  await expect(page.locator(".hud-vitals")).toBeVisible();
  const before = await page.evaluate(() => (window.__fireshot as unknown as { world(): { player: { pos: { x: number; z: number }; yaw: number } } }).world().player);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => (window.__fireshot as unknown as { world(): { player: { pos: { x: number; z: number }; yaw: number } } }).world().player);
  expect(Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z)).toBeGreaterThan(0.2);
  expect(after.yaw).toBeCloseTo(before.yaw, 5);
  expect(errors).toEqual([]);
});

test("tutorial sem conta: terminal, morte explicada e debriefing", async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Experimentar o tutorial/ }).click();
  await startMission(page);

  // terminal de múltipla escolha: erro mostra a explicação, acerto avança
  await page.evaluate(() => window.__fireshot!.openTerminal("t1"));
  await expectMode(page, "terminal");
  const answer = await page.evaluate(() => (window.__fireshot as unknown as { terminal(): { question: { answer: number; options: string[] } } }).terminal().question);
  await page.locator(".mc-option").nth((answer.answer + 1) % answer.options.length).click();
  await page.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(page.getByText("Resposta incorreta")).toBeVisible();
  await expect(page.getByText("Entenda")).toBeVisible();
  await page.getByRole("button", { name: /Sair do terminal/ }).last().click();
  await expectMode(page, "playing");

  // morte com explicação da ameaça
  await page.evaluate(() => window.__fireshot!.hurt(999, "worm"));
  await expect(page.getByRole("heading", { name: "Conexão perdida" })).toBeVisible();
  await expect(page.getByText(/Worms se replicam/).first()).toBeVisible();
  await page.getByRole("button", { name: /Restaurar do checkpoint/ }).click();
  await expectMode(page, "playing");

  // conclusão
  await page.evaluate(() => { window.__fireshot!.solveAll(); window.__fireshot!.clearArenas(); });
  await page.evaluate(() => window.__fireshot!.finish());
  await expectMode(page, "debrief");
  await expect(page.getByText("O que você aprendeu")).toBeVisible();
  await expect(page.getByText(/Modo sem conta/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("página pública de verificação carrega", async ({ page }) => {
  await page.goto("/verificar.html");
  await expect(page.getByRole("heading", { name: "Verificação de certificado" })).toBeVisible();
  await expect(page.getByLabel("Código do certificado")).toBeVisible();
});

test.describe("celular", () => {
  const { defaultBrowserType: _ignored, ...pixel } = devices["Pixel 7"];
  test.use(pixel);

  test("aparelho só de toque vê o aviso de jogar no computador", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("note")).toContainText("Jogue no computador");
    await expect(page.getByRole("note")).toContainText("teclado e mouse");
    // o menu continua usável na largura do celular
    await expect(page.getByRole("button", { name: /Criar conta e jogar/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
