import { defineConfig } from "vitest/config";

/**
 * Opt-in performance suite (task 3.7, R-SRCH-3): `pnpm test:perf`. Kept out of the root config so
 * `pnpm test` never runs it. Same Postgres harness as api-int (Testcontainers or
 * VK_TEST_DATABASE_URL). Local numbers are indicative only; the target-VPS check is task 7.4.
 */
export default defineConfig({
  test: {
    name: "api-perf",
    environment: "node",
    include: ["apps/api/test/perf/**/*.perf.test.ts"],
    globalSetup: ["apps/api/test/global-setup.ts"],
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
