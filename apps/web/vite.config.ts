import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./src/pwa.config.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const API_ORIGIN = process.env.VK_API_ORIGIN ?? "http://localhost:3000";

/**
 * Web app (design 12). `root` is pinned to this folder so the config behaves the same when it is
 * loaded from the repo root (Vitest `web` project) or from apps/web (`pnpm dev`).
 * Dev only: /api and /media are proxied to the API so the browser sees ONE origin (ADR9).
 */
export default defineConfig({
  root,
  plugins: [
    // Must run before react() so generated route files are transformed too.
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: `${root}src/routes`,
      generatedRouteTree: `${root}src/routeTree.gen.ts`,
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // The service worker is only emitted by `vite build` (devOptions off): dev and tests stay SW-free.
    VitePWA(pwaOptions),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: API_ORIGIN, changeOrigin: false },
      "/media": { target: API_ORIGIN, changeOrigin: false },
    },
  },
});
