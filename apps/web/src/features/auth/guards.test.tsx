import { ROLE } from "@vaultkeeper/shared/constants";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAuthApi, type FakeAuthApi } from "../../test/fake-auth-api";
import { server } from "../../test/msw-server";
import { currentHref, renderApp } from "../../test/render-app";

describe("route guards (design 12)", () => {
  let api: FakeAuthApi;

  beforeEach(() => {
    api = fakeAuthApi();
    server.use(...api.handlers);
  });

  it("_authed: an anonymous visitor is redirected to /login?redirect=<where they were going>", async () => {
    const { router } = renderApp("/settings?tab=rates");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/settings?tab=rates" });
  });

  it("_authed: the dashboard root also requires a session", async () => {
    const { router } = renderApp("/");

    await screen.findByRole("heading", { name: "Sign in" });
    expect(currentHref(router)).toBe("/login?redirect=%2F");
  });

  it("_admin: a signed-in non-admin is redirected to /", async () => {
    api.addAccount({ role: ROLE.USER }, { signedIn: true });
    const { router } = renderApp("/settings");

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(currentHref(router)).toBe("/");
  });

  it("_admin: an admin reaches admin pages", async () => {
    api.addAccount({ role: ROLE.ADMIN }, { signedIn: true });
    const { router } = renderApp("/settings");

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(currentHref(router)).toBe("/settings");
  });

  it("R-AUTH-1 S5: signing out clears the session and protected pages send you to /login", async () => {
    const user = userEvent.setup();
    const account = api.addAccount({}, { signedIn: true });
    const { router } = renderApp("/");
    expect(await screen.findByText(account.me.email)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(api.calls.signOut).toBe(1);

    await router.navigate({ to: "/" });
    await screen.findByRole("heading", { name: "Sign in" });
    expect(currentHref(router)).toBe("/login?redirect=%2F");
  });

  it("the signed-in shell never offers to link Google/Discord (R-AUTH-7 side effect)", async () => {
    api.addAccount({}, { signedIn: true });
    renderApp("/");

    await screen.findByRole("heading", { name: "Dashboard" });
    for (const control of [...screen.queryAllByRole("button"), ...screen.queryAllByRole("link")]) {
      expect(control).not.toHaveAccessibleName(/google|discord|link/i);
    }
  });
});
