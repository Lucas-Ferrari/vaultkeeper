import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

/** Stock list (/stock), add form (/stock/new) and the row move/delete actions. */
export class StockPage extends BasePage {
  readonly heading: Locator;
  readonly itemSearch: Locator;
  readonly locationSelect: Locator;
  readonly levelInput: Locator;
  readonly saveButton: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Stock", exact: true });
    this.itemSearch = page.getByRole("combobox", { name: "Item" });
    this.locationSelect = page.getByLabel("Location");
    this.levelInput = page.getByLabel("Level");
    this.saveButton = page.getByRole("button", { name: "Save entry" });
    this.emptyState = page.getByText(/No stock yet/);
  }

  override async goto(): Promise<void> {
    await super.goto("/stock");
    await expect(this.heading).toBeVisible();
  }

  /** Fuzzy-picks the first match of `query` (e.g. a typo), returns its name. */
  async addEntry(
    query: string,
    expected: RegExp,
    location: string,
    level: string,
  ): Promise<string> {
    await super.goto("/stock/new");
    await this.itemSearch.fill(query);
    const option = this.page.getByRole("option", { name: expected }).first();
    await expect(option).toBeVisible();
    const name = (await option.locator("span.font-medium").textContent()) ?? "";
    await option.click();
    await expect(this.page.getByText(`Selected: ${name}`)).toBeVisible();
    await this.locationSelect.selectOption({ label: location });
    await this.levelInput.fill(level);
    await this.saveButton.click();
    await expect(this.heading).toBeVisible();
    return name;
  }

  row(itemName: string): Locator {
    return this.page.getByRole("row").filter({ hasText: itemName });
  }

  async move(itemName: string, location: string): Promise<void> {
    await this.page.getByRole("button", { name: `Move ${itemName}` }).click();
    const dialog = this.page.getByRole("dialog", { name: `Move ${itemName}` });
    await dialog.getByLabel("Move to").selectOption({ label: location });
    await dialog.getByRole("button", { name: "Move" }).click();
    await expect(dialog).toHaveCount(0);
  }

  async remove(itemName: string): Promise<void> {
    await this.page.getByRole("button", { name: `Delete ${itemName}` }).click();
    await this.page.getByRole("button", { name: "Confirm delete" }).click();
  }
}
