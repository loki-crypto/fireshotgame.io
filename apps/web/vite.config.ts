import { defineConfig, type Plugin } from "vitest/config";
import preact from "@preact/preset-vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Em produção o nginx resolve /verificar/{codigo} para verificar.html (infra/nginx.conf).
 * O dev server precisa do mesmo rewrite, senão o link do certificado cai na SPA.
 */
function verifyPageRewrite(): Plugin {
  const rewrite = (server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }): void => {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/verificar(\/|$|\?)/.test(req.url)) req.url = "/verificar.html";
      next();
    });
  };
  return { name: "fireshot-verify-rewrite", configureServer: rewrite, configurePreviewServer: rewrite };
}

/**
 * `vite preview` responde com os mesmos cabeçalhos de segurança do vercel.json (CSP inclusive),
 * para o E2E contra o build pegar qualquer recurso que a política bloquearia em produção.
 * `upgrade-insecure-requests` fica de fora: o preview local é http.
 */
function productionHeaders(): Plugin {
  return {
    name: "fireshot-production-headers",
    configurePreviewServer(server) {
      const vercel = JSON.parse(readFileSync(resolve(__dirname, "../../vercel.json"), "utf8")) as {
        headers: { source: string; headers: { key: string; value: string }[] }[];
      };
      const rules = vercel.headers.map((r) => ({ re: new RegExp(`^${r.source}$`), headers: r.headers }));
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "/").split("?")[0]!;
        for (const rule of rules.filter((r) => r.re.test(path))) {
          for (const h of rule.headers) res.setHeader(h.key, h.value.replace(/;\s*upgrade-insecure-requests/, ""));
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), verifyPageRewrite(), productionHeaders()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.API_URL ?? "http://localhost:8000", changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      "/api": { target: process.env.API_URL ?? "http://localhost:8000", changeOrigin: false },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        verificar: resolve(__dirname, "verificar.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
