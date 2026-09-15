import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [preact()],
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
