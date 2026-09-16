import { expect, test } from "@playwright/test";
import { collectErrors, expectMode, startMission } from "./helpers";

/**
 * Fluxo com backend real: registro → tutorial → conclusão → XP no hub.
 * Rode com a API no ar (veja README §Desenvolvimento):
 *   E2E_API=1 npx playwright test e2e/api.spec.ts
 */
const RUN = process.env.E2E_API === "1";
const password = "senha-de-teste-123";

test.describe("com backend", () => {
  test.skip(!RUN, "requer a API rodando (E2E_API=1)");

  test("registro, tutorial completo e progresso persistido", async ({ page }) => {
    const errors = await collectErrors(page);
    const email = `e2e-${Date.now()}@exemplo.com`;

    await page.goto("/");
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await page.locator("input[name=name]").fill("Agente E2E");
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill(password);
    await page.locator("input[name=terms]").check();
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();

    await expect(page.getByRole("tab", { name: "Mapa da rede" })).toBeVisible();
    await expect(page.getByText("Nível 1")).toBeVisible();

    // fase 0: a única desbloqueada no começo
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await startMission(page);

    await page.evaluate(() => window.__fireshot!.answerAll());
    await page.evaluate(() => window.__fireshot!.clearArenas());
    await page.evaluate(() => window.__fireshot!.finish());
    await expectMode(page, "debrief");

    const rewards = page.locator(".rewards");
    await expect(rewards.getByText(/Terminais/)).toBeVisible();
    await expect(rewards.getByText(/Fase concluída/)).toBeVisible();
    await expect(rewards.getByText(/Primeira conclusão/)).toBeVisible();
    await expect(rewards.locator(".reward-total")).toContainText("XP");
    await expect(rewards.getByText(/rejeitad/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Voltar à central" }).click();
    await expect(page.getByRole("tab", { name: "Mapa da rede" })).toBeVisible();
    await expect(page.getByText(/[1-9]\d* XP/)).toBeVisible();

    // a fase 1 foi liberada e o progresso sobrevive ao recarregamento
    await page.reload();
    await expect(page.getByRole("tab", { name: "Mapa da rede" })).toBeVisible();
    await expect(page.locator(".map-node.done")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("login recupera a sessão e o certificado exige os requisitos", async ({ page }) => {
    const email = `e2e-cert-${Date.now()}@exemplo.com`;
    await page.goto("/");
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await page.locator("input[name=name]").fill("Agente Cert");
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill(password);
    await page.locator("input[name=terms]").check();
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Mapa da rede" })).toBeVisible();

    await page.getByRole("tab", { name: "Certificado" }).click();
    await expect(page.getByText("Ainda faltam critérios.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Emitir/ })).toHaveCount(0);
  });
});
