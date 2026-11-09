import { expect, test } from "@playwright/test";
import { generateTestUser, runCli } from "../helpers";
import { AccountsPage } from "../pages/accounts.page";
import { CatalogAdminPage } from "../pages/catalog-admin.page";
import { DashboardPage } from "../pages/dashboard-page";
import { GroupsPage } from "../pages/groups.page";
import { RegisterPage } from "../pages/register-page";
import { SettingsPage } from "../pages/settings.page";
import { StockPage } from "../pages/stock.page";

/**
 * Valuation, groups and settings end to end (task 5.12, R-VAL-1..3, R-GRP-1..3, R-SET-1..3,
 * R-GA-5). Settings are GLOBAL, so the run is single-worker (playwright.config) and the defaults
 * (rate 7.5, 10 vaults) are restored afterwards.
 */
test.describe.configure({ mode: "serial" });

const DEFAULTS = { rate: "7.5", vaultCount: 10 };

test.describe("Valuation", () => {
  test.beforeAll(() => {
    runCli("seed");
  });

  test(
    "partial total with an unpriced entry, rate 8 updates MP, lower vault_count flags a vault",
    { tag: ["@critical", "@e2e", "@valuation", "@VAL-E2E-001"] },
    async ({ page }) => {
      const user = generateTestUser();
      const suffix = user.email.slice(4, 22);
      const priced = `E2E Priced ${suffix}`;
      const bare = `E2E Bare ${suffix}`;
      const account = `Main ${suffix}`;
      const group = `Set ${suffix}`;
      const register = new RegisterPage(page);
      const dashboard = new DashboardPage(page);
      const catalog = new CatalogAdminPage(page);
      const accounts = new AccountsPage(page);
      const stock = new StockPage(page);
      const groups = new GroupsPage(page);
      const settings = new SettingsPage(page);

      await register.goto();
      await register.register(user);
      await dashboard.expectSignedInAs(user.email);
      // The same person acts as admin later; promoting first lets them add unpriced items.
      runCli("promote-admin", user.email);
      await page.reload();

      try {
        await catalog.importCsv(
          {
            name: "valuation.csv",
            buffer: Buffer.from(`category,name\nwings,${priced}\nwings,${bare}\n`),
          },
          /^2 to create$/,
        );

        await accounts.goto();
        await accounts.createAndOpen(account);
        // Price override 100 MC in Vault 10; the bare item stays unpriced in Vault 1.
        await stock.addEntry(priced, new RegExp(priced), `${account} · Vault 10`, "0", "100");
        await stock.addEntry(bare, new RegExp(bare), `${account} · Vault 1`, "0");

        await groups.create(group);
        await stock.goto();
        await stock.addToGroup([priced, bare], group);
        await groups.open(group);
        await expect(groups.totals.getByTestId("total-mc")).toHaveText("100.00");
        await expect(groups.totals).toContainText("1 item without price");

        await dashboard.goto();
        await expect(dashboard.totalMc).toHaveText("100.00");
        await expect(dashboard.totalMp).toHaveText("750.00");
        await expect(dashboard.totals).toContainText("1 item without price");
        await expect(dashboard.totals).toContainText("Partial total");

        await settings.save({ rate: "8" });
        await dashboard.goto();
        await expect(dashboard.totalMp).toHaveText("800.00");

        await settings.save({ vaultCount: 9 });
        await accounts.goto();
        await page.getByRole("link", { name: account, exact: true }).click();
        const vault10 = page
          .getByRole("listitem")
          .filter({ has: accounts.locationLink("Vault 10") });
        await expect(vault10).toContainText("over limit");
        await expect(accounts.vaultLinks()).toHaveCount(10);
        await dashboard.goto();
        await expect(dashboard.totalMc).toHaveText("100.00");
      } finally {
        await settings.save(DEFAULTS);
      }
    },
  );
});
