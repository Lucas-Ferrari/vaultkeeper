import { expect, test } from "@playwright/test";
import { generateTestUser, runCli } from "../helpers";
import { AccountsPage } from "../pages/accounts.page";
import { DashboardPage } from "../pages/dashboard-page";
import { RegisterPage } from "../pages/register-page";
import { StockPage } from "../pages/stock.page";

/**
 * Accounts + stock end to end (task 4.13, R-GA-1..3, R-STK-1..4): real API + Postgres.
 * Serial like the other specs (one client address, auth rate limits).
 */
test.describe.configure({ mode: "serial" });

test.describe("Accounts and stock", () => {
  test.beforeAll(() => {
    // The fuzzy picker needs the OpenMU catalog (idempotent).
    runCli("seed");
  });

  test(
    "account gets 10 vaults, character gets an inventory, stock is added, moved and deleted",
    { tag: ["@critical", "@e2e", "@stock", "@STK-E2E-001"] },
    async ({ page }) => {
      const user = generateTestUser();
      const register = new RegisterPage(page);
      const dashboard = new DashboardPage(page);
      const accounts = new AccountsPage(page);
      const stock = new StockPage(page);
      const accountName = `Main ${user.email.slice(4, 18)}`;

      await register.goto();
      await register.register(user);
      await dashboard.expectSignedInAs(user.email);

      await accounts.goto();
      await accounts.createAndOpen(accountName);
      await expect(accounts.vaultLinks()).toHaveCount(10);
      await accounts.addCharacter("DarkLord");

      // Typo on purpose: "wigns" must still find wings (R-SRCH-1).
      const itemName = await stock.addEntry("wigns", /Wings/, `${accountName} · Vault 1`, "13");
      await expect(stock.row(itemName)).toContainText("Vault 1");
      await expect(stock.row(itemName)).toContainText("+13");

      await stock.move(itemName, `${accountName} · Inventory – DarkLord`);
      await expect(stock.row(itemName)).toContainText("Inventory – DarkLord");

      await stock.remove(itemName);
      await expect(stock.emptyState).toBeVisible();
    },
  );
});
