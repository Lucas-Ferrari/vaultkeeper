import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

/** Signed-in home ("/") with the authed header. */
export class DashboardPage extends BasePage {
  readonly heading: Locator;
  readonly signOutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Dashboard" });
    this.signOutButton = page.getByRole("button", { name: "Sign out" });
  }

  override async goto(): Promise<void> {
    await super.goto("/");
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
