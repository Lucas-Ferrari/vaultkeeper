import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

/** Groups list + create (/groups) and group detail (/groups/:id). */
export class GroupsPage extends BasePage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly createButton: Locator;
  readonly totals: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Groups", exact: true });
    this.nameInput = page.getByLabel("Group name");
    this.createButton = page.getByRole("button", { name: "Create group" });
    this.totals = page.getByRole("region", { name: "Group value" });
  }

  override async goto(): Promise<void> {
    await super.goto("/groups");
    await expect(this.heading).toBeVisible();
  }

  async create(name: string): Promise<void> {
    await this.goto();
    await this.nameInput.fill(name);
    await this.createButton.click();
    await expect(this.page.getByRole("link", { name, exact: true })).toBeVisible();
  }

  async open(name: string): Promise<void> {
    await this.goto();
    await this.page.getByRole("link", { name, exact: true }).click();
    await expect(this.page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
}
