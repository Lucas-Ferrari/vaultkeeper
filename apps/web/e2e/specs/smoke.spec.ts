import { expect, test } from "@playwright/test";
import { LoginPage } from "../pages/login-page";

test.describe("Smoke", () => {
  test(
    "a signed-out visit to / shows the sign-in page inside the shell, with the disclaimer",
    { tag: ["@critical", "@e2e", "@smoke", "@SMOKE-E2E-001"] },
    async ({ page }) => {
      const login = new LoginPage(page);

      await page.goto("/");

      await login.expectRedirectedFrom("/");
      await login.expectDisclaimer();
    },
  );

  test(
    "the dev proxy reaches the API on the same origin",
    { tag: ["@high", "@e2e", "@smoke", "@SMOKE-E2E-002"] },
    async ({ request }) => {
      // /api/* is proxied by Vite; a guarded API path must be answered by Hono's session guard
      // with the JSON error envelope (R-AUTH-2), not by Vite's SPA fallback.
      const response = await request.get("/api/v1/me");

      expect(response.status()).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    },
  );
});
