import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class HomePage extends BasePage {
  readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Vaultkeeper" });
  }

  override async goto(): Promise<void> {
    await super.goto("/");
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }
}
