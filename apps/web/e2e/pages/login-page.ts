import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";

export interface Credentials {
  email: string;
  password: string;
}

export class LoginPage extends BasePage {
  readonly heading: Locator;
  readonly googleButton: Locator;
  readonly discordButton: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly forgotPasswordNote: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Sign in" });
    this.googleButton = page.getByRole("button", { name: "Continue with Google" });
    this.discordButton = page.getByRole("button", { name: "Continue with Discord" });
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.submitButton = page.getByRole("button", { name: "Sign in" });
    this.forgotPasswordNote = page.getByText("Forgot password? Ask an admin");
    this.errorAlert = page.getByRole("alert");
  }

  override async goto(): Promise<void> {
    await super.goto("/login");
  }

  async login({ email, password }: Credentials): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.googleButton).toBeVisible();
    await expect(this.discordButton).toBeVisible();
    await expect(this.forgotPasswordNote).toBeVisible();
  }

  /** Landed here because a protected page was requested while signed out. */
  async expectRedirectedFrom(path: string): Promise<void> {
    await expect(this.heading).toBeVisible();
    const url = new URL(this.page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirect")).toBe(path);
  }
}
