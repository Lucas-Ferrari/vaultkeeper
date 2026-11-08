import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

export interface CsvUpload {
  name: string;
  buffer: Buffer;
}

/** Admin catalog: list (/catalog), item edit (/catalog/:id) and CSV import (/catalog/import). */
export class CatalogAdminPage extends BasePage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly priceInput: Locator;
  readonly saveButton: Locator;
  readonly imageInput: Locator;
  readonly csvInput: Locator;
  readonly previewButton: Locator;
  readonly confirmButton: Locator;
  readonly importStatus: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Catalog", exact: true });
    this.searchInput = page.getByLabel("Search");
    this.priceInput = page.getByLabel("Reference price (MC)");
    this.saveButton = page.getByRole("button", { name: "Save" });
    this.imageInput = page.getByLabel("Upload image");
    this.csvInput = page.getByLabel("CSV file");
    this.previewButton = page.getByRole("button", { name: "Preview" });
    this.confirmButton = page.getByRole("button", { name: "Confirm import" });
    this.importStatus = page.getByRole("status");
  }

  override async goto(): Promise<void> {
    await super.goto("/catalog");
  }

  /** Preview first (dryRun), then confirm; expects no row errors. */
  async importCsv(file: string | CsvUpload, expectedPreview: RegExp): Promise<void> {
    await super.goto("/catalog/import");
    await this.csvInput.setInputFiles(
      typeof file === "string" ? file : { ...file, mimeType: "text/csv" },
    );
    await this.previewButton.click();
    await expect(this.page.getByText(expectedPreview).first()).toBeVisible();
    await expect(this.confirmButton).toBeEnabled();
    await this.confirmButton.click();
    await expect(this.importStatus).toContainText("Imported:");
  }

  async openItem(name: string): Promise<void> {
    await this.goto();
    await this.searchInput.fill(name);
    await this.page.getByRole("link", { name, exact: true }).click();
    await expect(this.page.getByRole("heading", { name, exact: true })).toBeVisible();
  }

  async setPrice(price: string): Promise<void> {
    await this.priceInput.fill(price);
    await this.saveButton.click();
    await expect(this.page.getByRole("status")).toHaveText("Saved.");
  }

  async uploadImage(path: string): Promise<void> {
    await this.imageInput.setInputFiles(path);
  }

  /** The item's <img> is served from /media and actually decodes. */
  async expectImageShown(name: string): Promise<void> {
    const image = this.page.locator(`img[alt="${name}"]`).first();
    await expect(image).toHaveAttribute("src", /^\/media\/catalog\/[a-f0-9]{64}\.png$/);
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
  }
}
