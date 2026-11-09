import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

/** Admin global settings (/settings, R-SET-1..3). */
export class SettingsPage extends BasePage {
  readonly heading: Locator;
  readonly rateInput: Locator;
  readonly vaultCountInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Settings", exact: true });
    this.rateInput = page.getByLabel("MC to MP rate");
    this.vaultCountInput = page.getByLabel("Vaults per account");
    this.saveButton = page.getByRole("button", { name: "Save settings" });
  }

  override async goto(): Promise<void> {
    await super.goto("/settings");
    await expect(this.heading).toBeVisible();
    await expect(this.rateInput).not.toHaveValue("");
  }

  async save(values: { rate?: string; vaultCount?: number }): Promise<void> {
    await this.goto();
    if (values.rate !== undefined) await this.rateInput.fill(values.rate);
    if (values.vaultCount !== undefined) {
      await this.vaultCountInput.fill(String(values.vaultCount));
    }
    await this.saveButton.click();
    await expect(this.page.getByText("Settings saved.")).toBeVisible();
  }
}
