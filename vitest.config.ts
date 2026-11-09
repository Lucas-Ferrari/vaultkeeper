import { defineConfig } from "vitest/config";

/**
 * Root Vitest config (design 16). One project per suite so each can be run alone:
 *   pnpm vitest run --project <name>
 * api-int requires Docker (Testcontainers) or VK_TEST_DATABASE_URL.
 */
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "shared",
          environment: "node",
          include: ["packages/shared/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "api-client",
          environment: "node",
          include: ["packages/api-client/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "api-unit",
          environment: "node",
          include: ["apps/api/src/**/*.test.ts"],
          exclude: ["apps/api/src/**/*.int.test.ts"],
        },
      },
      {
        test: {
          name: "api-int",
          environment: "node",
          include: ["apps/api/src/**/*.int.test.ts", "apps/api/test/**/*.int.test.ts"],
          // Starts postgres:17-alpine via Testcontainers (or uses VK_TEST_DATABASE_URL) and
          // prepares the vk_template database; each test file clones it (apps/api/test/db.ts).
          globalSetup: ["apps/api/test/global-setup.ts"],
          hookTimeout: 60_000,
          testTimeout: 30_000,
        },
      },
      {
        // Same plugins as the app (React Compiler, router codegen); its `root` is apps/web,
        // so paths below are relative to apps/web.
        extends: "./apps/web/vite.config.ts",
        test: {
          name: "web",
          root: "./apps/web",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["src/test/setup.ts"],
        },
      },
      {
        test: {
          name: "catalog-import",
          environment: "node",
          include: ["scripts/catalog-import/**/*.test.ts"],
        },
      },
    ],
  },
});
