import { expect, test } from "@playwright/test";
import { generateTestUser, runCli } from "../helpers";
import { DashboardPage } from "../pages/dashboard-page";
import { LoginPage } from "../pages/login-page";
import { RegisterPage } from "../pages/register-page";

/**
 * Email/password auth end to end (R-AUTH-1 S1/S3/S5, R-AUTH-3 S3, R-AUTH-6 S4) against the real
 * API + Postgres. Serial: Better Auth rate-limits sign-in to 3 per 10 s per client, and every
 * request reaches the API from the same address.
 */
test.describe.configure({ mode: "serial" });

test.describe("Auth", () => {
  const account = generateTestUser();

  test(
    "register lands on the dashboard; sign-out locks protected pages; signing in again works",
    { tag: ["@critical", "@e2e", "@auth", "@AUTH-E2E-001"] },
    async ({ page }) => {
      const register = new RegisterPage(page);
      const dashboard = new DashboardPage(page);
      const login = new LoginPage(page);

      await register.goto();
      await register.register(account);
      await dashboard.expectSignedInAs(account.email);
      await dashboard.expectDisclaimer();

      await dashboard.signOut();
      await expect(login.heading).toBeVisible();
      await page.goto("/settings");
      await login.expectRedirectedFrom("/settings");
      await login.expectLoaded();

      await login.login(account);
      // Back to the page that was asked for; a plain user is then sent home by the admin guard.
      await dashboard.expectSignedInAs(account.email);
    },
  );

  test(
    "a wrong password gets a generic error and no session",
    { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-002"] },
    async ({ page }) => {
      const login = new LoginPage(page);

      await login.goto();
      await login.login({ email: account.email, password: "not-the-password" });

      await expect(login.errorAlert).toHaveText("Invalid email or password.");
      await page.goto("/");
      await login.expectRedirectedFrom("/");
    },
  );

  test(
    "promote-admin CLI makes the user an admin who can open admin pages",
    { tag: ["@high", "@e2e", "@auth", "@AUTH-E2E-003"] },
    async ({ page }) => {
      const login = new LoginPage(page);

      await page.goto("/login?redirect=%2Fsettings");
      await login.login(account);
      await new DashboardPage(page).expectSignedInAs(account.email);

      expect(runCli("promote-admin", account.email)).toContain(`promoted ${account.email}`);

      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await expect(page).toHaveURL("/settings");
    },
  );
});
