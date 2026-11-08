import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

/** Signed-in home ("/"): authed header + valuation dashboard (R-VAL-2/3). */
export class DashboardPage extends BasePage {
  readonly heading: Locator;
  readonly signOutButton: Locator;
  readonly totals: Locator;
  readonly totalMc: Locator;
  readonly totalMp: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Dashboard" });
    this.signOutButton = page.getByRole("button", { name: "Sign out" });
    this.totals = page.getByRole("region", { name: "Total value" });
    this.totalMc = this.totals.getByTestId("total-mc");
    this.totalMp = this.totals.getByTestId("total-mp");
  }

  override async goto(): Promise<void> {
    await super.goto("/");
    await expect(this.heading).toBeVisible();
  }

  async expectSignedInAs(email: string): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.page).toHaveURL("/");
    await expect(this.page.getByText(email, { exact: true })).toBeVisible();
  }

  async signOut(): Promise<void> {
    await this.signOutButton.click();
  }
}
