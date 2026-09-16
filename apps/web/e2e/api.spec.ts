import { expect, test } from "@playwright/test";
import { collectErrors, expectMode, registerViaUi, startMission } from "./helpers";

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

    await registerViaUi(page, { name: "Agente E2E", email, password });
    await expect(page.getByLabel("Nível 1", { exact: true })).toBeVisible();

    // fase 0: a única desbloqueada no começo
    await page.getByRole("button", { name: "Iniciar fase" }).click();
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
    await registerViaUi(page, { name: "Agente Cert", email, password });

    await page.getByRole("tab", { name: "Certificado" }).click();
    await expect(page.getByText("Ainda faltam critérios.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Emitir/ })).toHaveCount(0);
  });
});

test.describe("agente e rank", () => {
  test.skip(!RUN, "requer a API rodando (E2E_API=1)");

  test("cadastro com bonequinho e username, rank por fase e troca de agente", async ({ page }) => {
    const errors = await collectErrors(page);
    const username = await registerViaUi(page, { name: "Agente Rank", email: `e2e-rank-${Date.now()}@exemplo.com`, password, avatar: "androide" });

    // cartão do jogador: bonequinho escolhido no menu, username e nível
    await expect(page.locator(".player-card")).toContainText(`@${username}`);
    await expect(page.getByRole("button", { name: /^Androide\./ })).toBeVisible();

    // username já em uso é avisado no cadastro
    const other = await page.context().browser()!.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    await otherPage.getByRole("button", { name: /Criar conta e jogar/ }).click();
    await otherPage.locator("input[name=username]").fill(username.toUpperCase());
    await expect(otherPage.getByText("Este nome de jogador já está em uso.")).toBeVisible();
    await other.close();

    // conclui o tutorial e aparece no rank da fase com a própria linha destacada
    await page.getByRole("button", { name: "Iniciar fase" }).click();
    await startMission(page);
    await page.evaluate(() => window.__fireshot!.answerAll());
    await page.evaluate(() => window.__fireshot!.clearArenas());
    await page.evaluate(() => window.__fireshot!.finish());
    await expectMode(page, "debrief");
    await expect(page.locator(".reward-total")).toContainText("XP");
    await page.getByRole("button", { name: "Voltar à central" }).click();

    await page.getByRole("tab", { name: "Rank" }).click();
    await expect(page.getByText(/Quem concluiu mais fases fica à frente/)).toBeVisible();
    await page.getByRole("button", { name: "Por fase" }).click();
    await page.getByLabel("Fase do rank").selectOption("00-tutorial");
    const mine = page.locator(".podium-spot.me, .rank-row.me");
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(`@${username}`);
    await expect(page.locator(".rank")).not.toContainText("@exemplo.com");

    // troca de agente no perfil reflete no cartão
    await page.getByRole("tab", { name: "Perfil" }).click();
    await page.locator('.avatar-panel [data-avatar="veterana"]').click();
    await expect(page.getByText("Agente atualizado.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Veterana\./ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /^Veterana\./ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("percurso completo", () => {
  test.skip(!RUN, "requer a API rodando (E2E_API=1)");

  test("todas as fases do currículo são jogáveis e liberam a seguinte", async ({ page }) => {
    test.setTimeout(300_000); // dez fases, cada uma com briefing, terminais e arena
    const errors = await collectErrors(page);
    const email = `e2e-run-${Date.now()}@exemplo.com`;
    await registerViaUi(page, { name: "Agente Percurso", email, password });

    const total = await page.locator(".map-node").count();
    expect(total).toBe(10);

    for (let i = 0; i < total; i++) {
      await page.locator(".map-node").nth(i).click();
      await page.getByRole("button", { name: /^(Iniciar fase|Jogar de novo)$/ }).click();
      await startMission(page);
      await page.evaluate(() => window.__fireshot!.answerAll());
      await page.evaluate(() => window.__fireshot!.clearArenas());
      await page.evaluate(() => window.__fireshot!.defeatBoss());
      await page.evaluate(() => window.__fireshot!.finish());
      await expectMode(page, "debrief");
      await expect(page.locator(".rewards")).not.toContainText("não validou");
      await page.getByRole("button", { name: "Voltar à central" }).click();
      await expect(page.getByRole("tab", { name: "Mapa da rede" })).toBeVisible();
      await expect(page.locator(".map-node.done")).toHaveCount(i + 1);
    }
    await expect(page.locator(".map-node.locked")).toHaveCount(0);

    // ── certificado (a API do E2E roda com CERT_MIN_ACTIVE_HOURS=0) ──────────
    await page.getByRole("tab", { name: "Certificado" }).click();
    await expect(page.getByText("Você cumpre todos os critérios.")).toBeVisible();
    await page.locator("input[autocomplete=name]").fill("Agente Percurso da Silva");
    await expect(page.locator(".cert-preview")).toContainText("Agente Percurso da Silva");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Emitir certificado" }).click();

    const issued = page.locator(".certificate section", { hasText: "Certificado emitido" });
    await expect(issued).toContainText("Agente Percurso da Silva");
    const code = (await issued.textContent())?.match(/([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/)?.[1];
    expect(code).toBeTruthy();

    // PDF baixável pelo dono
    const pdf = await page.request.get(`/api/v1/certificates/${code}.pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

    // página pública de verificação
    await page.goto(`/verificar/${code}`);
    await expect(page.getByRole("status")).toContainText("válido");
    await expect(page.getByText("Agente Percurso da Silva")).toBeVisible();
    await expect(page.getByText("Assinatura digital Ed25519 válida")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
