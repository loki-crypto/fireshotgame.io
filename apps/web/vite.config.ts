import { defineConfig, type Plugin } from "vitest/config";
import preact from "@preact/preset-vite";
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

export default defineConfig({
  plugins: [preact(), verifyPageRewrite()],
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
