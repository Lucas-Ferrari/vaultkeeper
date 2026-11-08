import { expect, test } from "@playwright/test";
import { LoginPage } from "../pages/login-page";

const OFFLINE_BANNER = "You are offline, data may be stale";

// Runs only in the `preview` project (production bundle): dev mode has no service worker.
test.describe("PWA", () => {
  test(
    "the manifest is linked and valid (R-PWA-1)",
    { tag: ["@high", "@e2e", "@pwa", "@PWA-E2E-001"] },
    async ({ page, request }) => {
      await page.goto("/login");

      const href = await page.locator('link[rel="manifest"]').getAttribute("href");
      expect(href).toBeTruthy();
      const response = await request.get(href ?? "");
      expect(response.ok()).toBe(true);
      const manifest = (await response.json()) as {
        name: string;
        display: string;
        start_url: string;
        icons: { sizes: string; purpose?: string }[];
      };
      expect(manifest).toMatchObject({
        name: "Vaultkeeper",
        display: "standalone",
        start_url: "/",
      });
      const sizes = manifest.icons.map((icon) => icon.sizes);
      expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
      expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    },
  );

  test(
    "the service worker registers and the app shell loads offline (R-PWA-3 S1)",
    { tag: ["@critical", "@e2e", "@pwa", "@PWA-E2E-002"] },
    async ({ page, context }) => {
      const login = new LoginPage(page);
      await page.goto("/login");
      await expect(login.heading).toBeVisible();

      // `ready` = active SW with the precache filled. registerType 'prompt' does not claim
      // clients, so the page becomes controlled on the next navigation.
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

      await context.setOffline(true);
      await page.reload();

      // Shell from the precache (never the browser's offline error page): banner, an explicit
      // offline view (the session check needs /api, which is NetworkOnly) and the footer.
      await expect(page.getByText(OFFLINE_BANNER)).toBeVisible();
      await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();

      await context.setOffline(false);
    },
  );
});
