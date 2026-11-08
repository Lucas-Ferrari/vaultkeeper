import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";
import type { Credentials } from "./login-page";

export interface NewAccount extends Credentials {
  name: string;
}

export class RegisterPage extends BasePage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Create your account" });
    this.nameInput = page.getByLabel("Name");
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.submitButton = page.getByRole("button", { name: "Create account" });
  }

  override async goto(): Promise<void> {
    await super.goto("/register");
  }

  async register({ name, email, password }: NewAccount): Promise<void> {
    await expect(this.heading).toBeVisible();
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
