import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

/** Game accounts: list + create (/accounts) and account detail (/accounts/:id). */
export class AccountsPage extends BasePage {
  readonly heading: Locator;
  readonly accountNameInput: Locator;
  readonly addAccountButton: Locator;
  readonly characterNameInput: Locator;
  readonly addCharacterButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Game accounts" });
    this.accountNameInput = page.getByLabel("Account name");
    this.addAccountButton = page.getByRole("button", { name: "Add account" });
    this.characterNameInput = page.getByLabel("Character name");
    this.addCharacterButton = page.getByRole("button", { name: "Add character" });
  }

  override async goto(): Promise<void> {
    await super.goto("/accounts");
    await expect(this.heading).toBeVisible();
  }

  /** Creates an account and opens its detail page. */
  async createAndOpen(name: string): Promise<void> {
    await this.accountNameInput.fill(name);
    await this.addAccountButton.click();
    await this.page.getByRole("link", { name, exact: true }).click();
    await expect(this.page.getByRole("heading", { name, exact: true })).toBeVisible();
  }

  vaultLinks(): Locator {
    return this.page.getByRole("link", { name: /^Vault \d+$/ });
  }

  async addCharacter(name: string): Promise<void> {
    await this.characterNameInput.fill(name);
    await this.addCharacterButton.click();
    await expect(this.locationLink(`Inventory – ${name}`)).toBeVisible();
  }

  locationLink(label: string): Locator {
    return this.page.getByRole("link", { name: label, exact: true });
  }
}
