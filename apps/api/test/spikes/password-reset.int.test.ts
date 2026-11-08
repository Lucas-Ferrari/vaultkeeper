import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../db";
import {
  cookieHeader,
  createSpikeAuth,
  getSession,
  Pool,
  signInEmail,
  signUpEmail,
  type SpikeAuth,
} from "./better-auth-harness";

/**
 * SPIKE 2.2 (R-AUTH-6, design 08b). Questions:
 *   1. is `(await auth.$context).password.hash` output accepted by /sign-in/email?
 *   2. how do we revoke every session of a user, and does the 5-minute cookie cache
 *      (design 08: session.cookieCache maxAge 300) keep a revoked session alive?
 * Kept as the seed for task 2.16 (reset-password CLI).
 */

const OLD_PASSWORD = "old-password-1";
const NEW_PASSWORD = "new-password-2";

/** What the reset-password CLI will do, using only Better Auth's own primitives. */
async function resetPassword(auth: SpikeAuth, userId: string, password: string): Promise<void> {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  await ctx.internalAdapter.updatePassword(userId, hash);
  await ctx.internalAdapter.deleteUserSessions(userId);
}

describe("spike 2.2: password reset primitive + session revocation", () => {
  const db = useTestDatabase();
  let pool: Pool;
  let auth: SpikeAuth;

  beforeAll(async () => {
    pool = new Pool({ connectionString: db.current.url });
    auth = createSpikeAuth(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  async function signedUpUser(email: string) {
    const response = await signUpEmail(auth, { email, password: OLD_PASSWORD, name: "Ana" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };
    return { userId: body.user.id, cookie: cookieHeader(response) };
  }

  it("the $context hasher's output is accepted by email sign-in; the old password stops working", async () => {
    const { userId } = await signedUpUser("reset1@x.com");

    await resetPassword(auth, userId, NEW_PASSWORD);

    const oldAttempt = await signInEmail(auth, { email: "reset1@x.com", password: OLD_PASSWORD });
    expect(oldAttempt.status).toBe(401);
    const newAttempt = await signInEmail(auth, { email: "reset1@x.com", password: NEW_PASSWORD });
    expect(newAttempt.status).toBe(200);
  });

  it("deleteUserSessions revokes the session in the database (token-only cookie)", async () => {
    const { userId, cookie } = await signedUpUser("reset2@x.com");
    const tokenOnly = cookie
      .split("; ")
      .filter((pair) => pair.startsWith("better-auth.session_token="))
      .join("; ");
    expect(await getSession(auth, tokenOnly)).not.toBeNull();

    await resetPassword(auth, userId, NEW_PASSWORD);

    expect(await getSession(auth, tokenOnly)).toBeNull();
  });

  it("GOTCHA: with cookieCache on (design 08, maxAge 300) a revoked session SURVIVES via session_data", async () => {
    const { userId, cookie } = await signedUpUser("reset3@x.com");
    expect(cookie).toContain("better-auth.session_data=");

    await resetPassword(auth, userId, NEW_PASSWORD);

    // Signed cache cookie is trusted without a DB read until it expires (up to 5 min).
    expect(await getSession(auth, cookie)).not.toBeNull();
    // Bypassing the cache per request does see the revocation.
    expect(await getSession(auth, cookie, { disableCookieCache: true })).toBeNull();
  });

  it("with cookieCache disabled, the full browser cookie set gets no session after revocation", async () => {
    const noCache = createSpikeAuth(pool, { session: { cookieCache: { enabled: false } } });
    const response = await signUpEmail(noCache, {
      email: "reset4@x.com",
      password: OLD_PASSWORD,
      name: "Ana",
    });
    const { user } = (await response.json()) as { user: { id: string } };
    const cookie = cookieHeader(response);
    expect(await getSession(noCache, cookie)).not.toBeNull();

    await resetPassword(noCache, user.id, NEW_PASSWORD);

    expect(await getSession(noCache, cookie)).toBeNull();
  });
});
