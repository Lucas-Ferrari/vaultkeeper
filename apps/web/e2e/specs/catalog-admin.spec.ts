import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { generateTestUser, runCli } from "../helpers";
import { CatalogAdminPage } from "../pages/catalog-admin.page";
import { DashboardPage } from "../pages/dashboard-page";
import { RegisterPage } from "../pages/register-page";

const PNG = fileURLToPath(new URL("../../../api/test/fixtures/images/pixel.png", import.meta.url));
const TEMPLATE = fileURLToPath(new URL("../../public/catalog-template.csv", import.meta.url));

/**
 * Admin catalog end to end (task 3.22, R-CAT-2/5/6, R-AUTH-4): real API + Postgres + disk media.
 * Serial for the same reason as auth.spec (one client address, auth rate limits).
 */
test.describe.configure({ mode: "serial" });

test.describe("Catalog admin", () => {
  test.beforeAll(() => {
    // Categories come from the OpenMU seed (idempotent; keeps admin edits).
    runCli("seed");
  });

  test(
    "admin imports CSVs, sets a price and uploads an image that shows on the item",
    { tag: ["@critical", "@e2e", "@catalog", "@CAT-E2E-001"] },
    async ({ page }) => {
      const admin = generateTestUser();
      const register = new RegisterPage(page);
      const dashboard = new DashboardPage(page);
      const catalog = new CatalogAdminPage(page);

      await register.goto();
      await register.register(admin);
      await dashboard.expectSignedInAs(admin.email);
      runCli("promote-admin", admin.email);
      await page.reload();
      await expect(page.getByRole("link", { name: "Catalog" })).toBeVisible();

      await catalog.importCsv(TEMPLATE, /to create|to update|unchanged/);

      const itemName = `E2E Wings ${admin.email.slice(4, 24)}`;
      await catalog.importCsv(
        { name: "e2e.csv", buffer: Buffer.from(`category,name\nwings,${itemName}\n`) },
        /^1 to create$/,
      );

      await catalog.openItem(itemName);
      await catalog.setPrice("250.5");
      await catalog.uploadImage(PNG);
      await catalog.expectImageShown(itemName);

      await catalog.goto();
      await catalog.searchInput.fill(itemName);
      const row = page.getByRole("row", { name: new RegExp(itemName) });
      await expect(row).toContainText("250.50");
      await catalog.expectImageShown(itemName);
    },
  );

  test(
    "a plain user visiting the admin catalog is redirected to /",
    { tag: ["@critical", "@e2e", "@catalog", "@CAT-E2E-002"] },
    async ({ page }) => {
      const user = generateTestUser();
      const register = new RegisterPage(page);
      const dashboard = new DashboardPage(page);

      await register.goto();
      await register.register(user);
      await dashboard.expectSignedInAs(user.email);

      await page.goto("/catalog");
      await expect(dashboard.heading).toBeVisible();
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("link", { name: "Catalog" })).toHaveCount(0);
    },
  );
});
