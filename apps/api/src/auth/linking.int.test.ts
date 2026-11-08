import { OAUTH_LINK_ERROR } from "@vaultkeeper/shared/constants";
import { meResponse } from "@vaultkeeper/shared/schemas/me";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, getWith, signUp, type TestApp } from "../../test/auth-helpers";
import { useTestDatabase } from "../../test/db";
import {
  FAKE_OAUTH_ENV,
  oauthServer,
  PROVIDER,
  runProviderFlow,
  signInWithProvider,
  type AuthHandler,
} from "../../test/fake-oauth";

const LINK_REFUSED: readonly string[] = Object.values(OAUTH_LINK_ERROR);

describe("safe OAuth linking with unverified emails (R-AUTH-7)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let server: AuthHandler;
  let seq = 0;
  const nextEmail = () => `owner${++seq}@x.com`;

  beforeAll(() => {
    oauthServer.listen({ onUnhandledFrame: "error" });
    t = createTestApp(db.current.url, { env: FAKE_OAUTH_ENV });
    server = { handler: async (request) => t.app.request(request) };
  });
  afterEach(() => oauthServer.resetHandlers());
  afterAll(async () => {
    oauthServer.close();
    await t.close();
  });

  async function providersOf(email: string): Promise<string[]> {
    const { rows } = await t.database.pool.query<{ providerId: string }>(
      `SELECT a.provider_id AS "providerId" FROM account a JOIN "user" u ON u.id = a.user_id
       WHERE u.email = $1 ORDER BY a.provider_id`,
      [email],
    );
    return rows.map((row) => row.providerId);
  }

  async function meWith(cookie: string) {
    const res = await getWith(t.app, "/api/v1/me", cookie);
    expect(res.status).toBe(200);
    return meResponse.parse(await res.json());
  }

  it("R-AUTH-1 S2: a first Google sign-in creates a role 'user' account and signs in", async () => {
    const email = nextEmail();
    const result = await signInWithProvider(server, PROVIDER.GOOGLE, {
      subject: `g-new-${seq}`,
      email,
      emailVerified: true,
      name: "New",
    });

    expect(result.location.pathname).toBe("/app");
    expect((await meWith(result.sessionCookie)).role).toBe("user");
  });

  it("S1: Google sign-in on an unverified password account's email is refused, nothing linked", async () => {
    const email = nextEmail();
    const attacker = await signUp(t.app, { email, password: "attacker-pass-1" });

    const result = await signInWithProvider(server, PROVIDER.GOOGLE, {
      subject: `g-victim-${seq}`,
      email,
      emailVerified: true,
      name: "Victim",
    });

    expect(result.location.pathname).toBe("/login");
    expect(LINK_REFUSED).toContain(result.location.searchParams.get("error"));
    expect(result.sessionCookie).toBe("");
    expect(await providersOf(email)).toEqual(["credential"]);
    // The attacker's password session still only reaches the attacker's own, unlinked user.
    expect((await meWith(attacker.cookie)).id).toBe(attacker.id);
  });

  it("S2: a Google user signing in later with Discord (same verified email) reaches the same user", async () => {
    const email = nextEmail();
    const google = await signInWithProvider(server, PROVIDER.GOOGLE, {
      subject: `g-owner-${seq}`,
      email,
      emailVerified: true,
      name: "Owner",
    });
    const googleUser = await meWith(google.sessionCookie);

    const discord = await signInWithProvider(server, PROVIDER.DISCORD, {
      subject: `17592884729911${seq}`,
      email,
      emailVerified: true,
      name: "Owner",
    });

    expect(discord.location.pathname).toBe("/app");
    expect((await meWith(discord.sessionCookie)).id).toBe(googleUser.id);
    expect(await providersOf(email)).toEqual(["discord", "google"]);
  });

  it("2nd layer: the account-create guard refuses attaching OAuth to an unverified password user", async () => {
    // Explicit /link-social bypasses Better Auth's implicit-link gate, so only the
    // databaseHooks.account.create.before guard can stop it here.
    const email = nextEmail();
    const owner = await signUp(t.app, { email });

    const callback = await runProviderFlow(
      server,
      PROVIDER.GOOGLE,
      { subject: `g-explicit-${seq}`, email, emailVerified: true, name: "X" },
      { startPath: "/link-social", cookie: owner.cookie },
    );

    // In the link flow Better Auth answers the guard's APIError directly (no error redirect).
    expect(callback.status).toBe(403);
    expect(await callback.json()).toMatchObject({
      code: OAUTH_LINK_ERROR.LINK_REQUIRES_PASSWORD_SIGN_IN,
    });
    expect(await providersOf(email)).toEqual(["credential"]);
  });
});
