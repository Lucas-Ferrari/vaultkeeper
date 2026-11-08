import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base-page";
import type { Credentials } from "./login-page";

const RATE_LIMIT_RETRIES = 2;
const HTTP_TOO_MANY_REQUESTS = 429;
/** Better Auth's sign-up window (10 s) plus a margin. */
const RATE_LIMIT_WINDOW_MS = 10_500;

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

  /**
   * Spec files run in parallel from ONE client address, so sign-ups across files can hit Better
   * Auth's 3-per-10 s limit (real, kept on). Only on that exact refusal: wait the window out and
   * resubmit (max 2 retries); any other failure surfaces at the caller's next assertion.
   */
  async register({ name, email, password }: NewAccount): Promise<void> {
    await expect(this.heading).toBeVisible();
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
      const [response] = await Promise.all([
        this.page.waitForResponse((r) => r.url().includes("/api/auth/sign-up/email")),
        this.submitButton.click(),
      ]);
      if (response.status() !== HTTP_TOO_MANY_REQUESTS) return;
      await this.page.waitForTimeout(RATE_LIMIT_WINDOW_MS);
    }
  }
}
