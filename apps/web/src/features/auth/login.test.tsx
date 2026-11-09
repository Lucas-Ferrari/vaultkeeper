import { OAUTH_LINK_ERROR } from "@vaultkeeper/shared/constants";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAuthApi, TEST_PASSWORD, type FakeAuthApi } from "../../test/fake-auth-api";
import { server } from "../../test/msw-server";
import { currentHref, renderApp } from "../../test/render-app";

vi.mock(import("../../shared/lib/browser"), () => ({ assignLocation: vi.fn() }));
const { assignLocation } = await import("../../shared/lib/browser");

describe("login page (R-AUTH-1, R-AUTH-6 S4, R-AUTH-7)", () => {
  let api: FakeAuthApi;

  beforeEach(() => {
    api = fakeAuthApi();
    server.use(...api.handlers);
    vi.mocked(assignLocation).mockClear();
  });

  it("offers Google and Discord first, then the email form", async () => {
    renderApp("/login");

    const google = await screen.findByRole("button", { name: "Continue with Google" });
    const discord = screen.getByRole("button", { name: "Continue with Discord" });
    const email = screen.getByLabelText("Email");

    expect(google.compareDocumentPosition(discord) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(discord.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Not affiliated with Webzen");
  });

  it("S4: says to ask an admin for a forgotten password and has no reset/verify flow", async () => {
    renderApp("/login");

    expect(await screen.findByText(/Forgot password\? Ask an admin/)).toBeInTheDocument();
    const controls = [...screen.queryAllByRole("link"), ...screen.queryAllByRole("button")];
    for (const control of controls) {
      expect(control).not.toHaveAccessibleName(/reset|verify|forgot|email me/i);
    }
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("validates with the shared schema before calling the server", async () => {
    const user = userEvent.setup();
    renderApp("/login");

    await user.type(await screen.findByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(api.calls.signIn).toBe(0);
  });

  it("signs in with email + password and lands on the dashboard", async () => {
    const user = userEvent.setup();
    const account = api.addAccount();
    const { router } = renderApp("/login");

    await user.type(await screen.findByLabelText("Email"), account.me.email);
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(currentHref(router)).toBe("/");
    expect(screen.getByText(account.me.email)).toBeInTheDocument();
  });

  it("returns to the ?redirect= page after signing in", async () => {
    const user = userEvent.setup();
    const account = api.addAccount();
    const { router } = renderApp("/login?redirect=%2F%3Ftab%3Dsummary");

    await user.type(await screen.findByLabelText("Email"), account.me.email);
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("heading", { name: "Dashboard" });
    expect(currentHref(router)).toBe("/?tab=summary");
  });

  it("ignores an off-site ?redirect= (no open redirect)", async () => {
    const user = userEvent.setup();
    const account = api.addAccount();
    const { router } = renderApp("/login?redirect=%2F%2Fevil.example%2Fphish");

    await user.type(await screen.findByLabelText("Email"), account.me.email);
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("heading", { name: "Dashboard" });
    expect(currentHref(router)).toBe("/");
  });

  it("S3: a wrong password shows a generic error and stays on /login", async () => {
    const user = userEvent.setup();
    const account = api.addAccount();
    const { router } = renderApp("/login");

    await user.type(await screen.findByLabelText("Email"), account.me.email);
    await user.type(screen.getByLabelText("Password"), "wrong-password-1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(router.state.location.pathname).toBe("/login");
  });

  it.each(Object.values(OAUTH_LINK_ERROR))(
    "R-AUTH-7: OAuth callback error %s -> tells the user to sign in with their password",
    async (code) => {
      renderApp(`/login?error=${code}`);

      expect(await screen.findByRole("alert")).toHaveTextContent(/sign in with your password/i);
    },
  );

  it("any other OAuth callback error gets a generic provider message", async () => {
    renderApp("/login?error=access_denied");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/didn't work/i);
    expect(alert).not.toHaveTextContent(/password/i);
  });

  it("starts the Google flow back to the requested page, with errors coming back to /login", async () => {
    const user = userEvent.setup();
    renderApp("/login?redirect=%2Fstock");

    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(assignLocation).toHaveBeenCalledOnce());
    expect(assignLocation).toHaveBeenCalledWith("https://provider.example/authorize");
    expect(api.calls.social).toEqual([
      expect.objectContaining({
        provider: "google",
        callbackURL: "/stock",
        errorCallbackURL: "/login",
      }),
    ]);
  });

  it("starts the Discord flow", async () => {
    const user = userEvent.setup();
    renderApp("/login");

    await user.click(await screen.findByRole("button", { name: "Continue with Discord" }));

    await waitFor(() => expect(api.calls.social).toHaveLength(1));
    expect(api.calls.social[0]).toMatchObject({ provider: "discord", callbackURL: "/" });
  });

  it("an already signed-in visitor is sent on to the app", async () => {
    api.addAccount({}, { signedIn: true });
    const { router } = renderApp("/login");

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(currentHref(router)).toBe("/");
  });
});
