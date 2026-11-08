import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness (design 16). Both servers run in DEV mode (no production build, by project rule):
 * the API via tsx and the web app via Vite, which proxies /api and /media to the API, so the
 * browser sees one origin exactly like production behind Caddy.
 *
 * Run: pnpm e2e (from the repo root). Later specs need the dev Postgres:
 *   docker compose -f docker-compose.dev.yml up -d --wait
 */

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const API_PORT = 3000;
const WEB_PORT = 5173;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const isCI = Boolean(process.env.CI);

/** API env for e2e; real env vars win so a developer can point at another database. */
const apiEnv: Record<string, string> = {
  NODE_ENV: "test",
  PORT: String(API_PORT),
  PUBLIC_URL: WEB_URL,
  EXTRA_TRUSTED_ORIGINS: WEB_URL,
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://vaultkeeper:vaultkeeper@localhost:5432/vaultkeeper",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-not-for-production-use",
  MEDIA_DIR: process.env.MEDIA_DIR ?? `${repoRoot}.data/e2e-media`,
};

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
      command: "pnpm --filter @vaultkeeper/api dev",
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
