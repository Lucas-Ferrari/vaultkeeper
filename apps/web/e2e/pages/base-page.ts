import { expect, type Locator, type Page } from "@playwright/test";

/** Parent of every page object: navigation plus the app shell present on all pages. */
export class BasePage {
  readonly footer: Locator;

  constructor(protected readonly page: Page) {
    this.footer = page.getByRole("contentinfo");
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  /** R-DOC-2 S1: every page shows the non-affiliation disclaimer. */
  async expectDisclaimer(): Promise<void> {
    await expect(this.footer).toContainText("Not affiliated with Webzen or MEGADEV");
  }
}
