import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5174);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Por padrão sobe o Vite com os ganchos de teste (VITE_E2E=1).
 * Com E2E_BASE_URL definido (ex.: Docker Compose), testa a instância indicada.
 * Os testes que dependem da API rodam apenas com E2E_API=1.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `vite --port ${PORT} --strictPort`,
        url: BASE_URL,
        env: { VITE_E2E: "1" },
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
