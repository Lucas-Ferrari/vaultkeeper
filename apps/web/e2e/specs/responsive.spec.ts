import { expect, test, type Page } from "@playwright/test";
import { generateTestUser, runCli } from "../helpers";
import { AccountsPage } from "../pages/accounts.page";
import { CatalogAdminPage } from "../pages/catalog-admin.page";
import { DashboardPage } from "../pages/dashboard-page";
import { GroupsPage } from "../pages/groups.page";
import { auditLayout } from "../pages/layout-audit";
import { RegisterPage } from "../pages/register-page";
import { StockPage } from "../pages/stock.page";

/**
 * Responsive audit (task 6.4, R-PWA-2 S1): at 360x800 the MVP screens have no horizontal scroll
 * and every visible interactive element is at least 44x44 px.
 */
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 360, height: 800 } });

async function expectUsableOnPhone(page: Page, screen: string): Promise<void> {
  const audit = await auditLayout(page);
  expect
    .soft(audit.scrollWidth, `${screen}: horizontal scroll from ${audit.overflowing.join(" | ")}`)
    .toBeLessThanOrEqual(audit.innerWidth);
  expect.soft(audit.smallTargets, `${screen}: targets under 44x44`).toEqual([]);
  expect.soft(audit.offscreenTargets, `${screen}: actions outside the viewport`).toEqual([]);
}

test.describe("Responsive at 360 px", () => {
  test.beforeAll(() => {
    runCli("seed");
  });

  test(
    "item picker, stock list, group view and admin catalog fit a phone",
    { tag: ["@e2e", "@pwa", "@PWA-E2E-002"] },
    async ({ page }) => {
      const user = generateTestUser();
      const suffix = user.email.slice(4, 22);
      const account = `Phone ${suffix}`;
      const group = `Phone set ${suffix}`;
      const register = new RegisterPage(page);
      const dashboard = new DashboardPage(page);
      const accounts = new AccountsPage(page);
      const stock = new StockPage(page);
      const groups = new GroupsPage(page);
      const catalog = new CatalogAdminPage(page);

      await register.goto();
      await register.register(user);
      await dashboard.expectSignedInAs(user.email);
      runCli("promote-admin", user.email);
      await page.reload();

      await accounts.goto();
      await accounts.createAndOpen(account);
      const itemName = await stock.addEntry("wings", /Wings/, `${account} · Vault 1`, "11", "50");
      await groups.create(group);
      await stock.goto();
      await stock.addToGroup([itemName], group);

      // Item picker with its results open.
      await page.goto("/stock/new");
      await stock.itemSearch.fill("wings");
      await expect(page.getByRole("option").first()).toBeVisible();
      await expectUsableOnPhone(page, "item picker");

      await stock.goto();
      await expect(stock.row(itemName)).toBeVisible();
      await expectUsableOnPhone(page, "stock list");

      await groups.open(group);
      await expect(page.getByText(itemName)).toBeVisible();
      await expectUsableOnPhone(page, "group view");

      await catalog.goto();
      await expectUsableOnPhone(page, "admin catalog");
    },
  );
});
