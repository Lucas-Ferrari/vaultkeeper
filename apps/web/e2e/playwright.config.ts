import { defineConfig, devices } from "@playwright/test";
import { API_PORT, apiEnv, PREVIEW_URL, repoRoot, WEB_URL } from "./env";

/**
 * E2E harness (design 16). The API runs via tsx and the web app via the Vite dev server, which
 * proxies /api and /media to the API, so the browser sees one origin exactly like production
 * behind Caddy. The `preview` project additionally builds the web app (`vite build`, approved
 * exception to the no-build rule) and serves it with `vite preview` to test the service worker.
 *
 * Run: pnpm e2e (from the repo root). Needs the dev Postgres first:
 *   docker compose -f docker-compose.dev.yml up -d --wait
 * The API server applies pending migrations before it starts.
 */

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./specs",
  outputDir: "./test-results",
  fullyParallel: true,
  // One worker: valuation.spec changes GLOBAL settings (rate, vault_count) that other specs see.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? "github"
    : [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: /pwa\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      // Production bundle served by `vite preview` (same /api, /media proxy as dev): the only
      // project with a service worker (task 6.5, R-PWA-1/3).
      name: "preview",
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: PREVIEW_URL },
    },
  ],
  webServer: [
    {
      name: "api",
      command: "pnpm --filter @vaultkeeper/api db:migrate && pnpm --filter @vaultkeeper/api dev",
      cwd: repoRoot,
      url: `http://localhost:${API_PORT}/healthz`,
      env: apiEnv,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      name: "web",
      command: "pnpm --filter @vaultkeeper/web dev",
      cwd: repoRoot,
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      name: "preview",
      command: "pnpm --filter @vaultkeeper/web build && pnpm --filter @vaultkeeper/web preview",
      cwd: repoRoot,
      url: PREVIEW_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
