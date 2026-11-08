import { defineConfig, devices } from "@playwright/test";
import { API_PORT, apiEnv, repoRoot, WEB_URL } from "./env";

/**
 * E2E harness (design 16). Both servers run in DEV mode (no production build, by project rule):
 * the API via tsx and the web app via Vite, which proxies /api and /media to the API, so the
 * browser sees one origin exactly like production behind Caddy.
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
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? "github"
    : [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
  ],
});
