import { expect, test } from "@playwright/test";
import { HomePage } from "../pages/home-page";

test.describe("Smoke", () => {
  test(
    "root page renders the app shell with the disclaimer",
    { tag: ["@critical", "@e2e", "@smoke", "@SMOKE-E2E-001"] },
    async ({ page }) => {
      const home = new HomePage(page);

      await home.goto();

      await home.expectLoaded();
      await home.expectDisclaimer();
    },
  );

  test(
    "the dev proxy reaches the API on the same origin",
    { tag: ["@high", "@e2e", "@smoke", "@SMOKE-E2E-002"] },
    async ({ request }) => {
      // /api/* is proxied by Vite; an unknown API path must come back from Hono, not Vite.
      const response = await request.get("/api/v1/does-not-exist");

      expect(response.status()).toBe(404);
      expect(await response.text()).toBe("404 Not Found"); // Hono's default body
    },
  );
});
