import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAuthApi, type FakeAuthApi } from "../../test/fake-auth-api";
import { server } from "../../test/msw-server";
import { currentHref, renderApp } from "../../test/render-app";

describe("register page (R-AUTH-1 S1/S4, R-AUTH-6 S4)", () => {
  let api: FakeAuthApi;

  beforeEach(() => {
    api = fakeAuthApi();
    server.use(...api.handlers);
  });

  it("offers Google and Discord, then name/email/password, and no verify-email step", async () => {
    renderApp("/register");

    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByText(/verify|confirmation email/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("rejects a password under 10 characters without calling the server", async () => {
    const user = userEvent.setup();
    renderApp("/register");

    await user.type(await screen.findByLabelText("Name"), "Ana");
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.type(screen.getByLabelText("Password"), "short-pw1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Use at least 10 characters")).toBeInTheDocument();
    expect(api.calls.signUp).toEqual([]);
  });

  it("S1: creates the account, signs in and lands on the dashboard", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/register");

    await user.type(await screen.findByLabelText("Name"), " Ana ");
    await user.type(screen.getByLabelText("Email"), "Ana@Example.com");
    await user.type(screen.getByLabelText("Password"), "a-good-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(currentHref(router)).toBe("/");
    // The shared schema's parsed output is what reaches the server.
    expect(api.calls.signUp).toEqual([
      { name: "Ana", email: "ana@example.com", password: "a-good-password" },
    ]);
  });

  it("S4: a taken email shows an error and stays on /register", async () => {
    const user = userEvent.setup();
    const existing = api.addAccount();
    const { router } = renderApp("/register");

    await user.type(await screen.findByLabelText("Name"), "Copycat");
    await user.type(screen.getByLabelText("Email"), existing.me.email);
    await user.type(screen.getByLabelText("Password"), "another-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists",
    );
    expect(router.state.location.pathname).toBe("/register");
  });
});
