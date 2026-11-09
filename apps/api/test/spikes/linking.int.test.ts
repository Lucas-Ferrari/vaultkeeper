import { APIError } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../db";
import {
  countAccounts,
  createSpikeAuth,
  oauthServer,
  Pool,
  PROVIDER,
  providersOf,
  signInWithProvider,
  signUpEmail,
} from "./better-auth-harness";

/**
 * SPIKE 2.1 (R-AUTH-7, design 08, ADR18). Question: can Better Auth be stopped from linking an
 * OAuth identity into an existing email/password user whose email was never verified (account
 * pre-hijacking), while Google <-> Discord linking on verified emails keeps working?
 * Kept as the seed for task 2.14.
 */

type AccountCreateBefore = NonNullable<
  NonNullable<
    NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["account"]>["create"]
  >["before"]
>;

export const LINK_BLOCKED_CODE = "LINK_REQUIRES_PASSWORD_SIGN_IN";

/**
 * Candidate defence-in-depth hook: reject creating an OAuth account row for a user that already
 * has a credential account and an unverified email.
 */
const blockLinkIntoUnverifiedCredentialUser: AccountCreateBefore = async (account, ctx) => {
  if (account.providerId === "credential" || !ctx) return;
  const adapter = ctx.context.internalAdapter;
  const user = await adapter.findUserById(account.userId);
  if (!user || user.emailVerified) return;
  const accounts = await adapter.findAccounts(account.userId);
  if (accounts.some((existing) => existing.providerId === "credential")) {
    throw new APIError("FORBIDDEN", {
      code: LINK_BLOCKED_CODE,
      message: "This email already has a password account. Sign in with your password.",
    });
  }
};

describe("spike 2.1: OAuth linking into unverified credential users", () => {
  const db = useTestDatabase();
  let pool: Pool;
  let seq = 0;
  const nextEmail = () => `victim${++seq}@x.com`;

  beforeAll(async () => {
    oauthServer.listen({ onUnhandledFrame: "error" });
    pool = new Pool({ connectionString: db.current.url });
  });
  afterEach(() => oauthServer.resetHandlers());
  afterAll(async () => {
    oauthServer.close();
    await pool.end();
  });

  async function attackerPreRegisters(auth: ReturnType<typeof createSpikeAuth>, email: string) {
    const response = await signUpEmail(auth, {
      email,
      password: "attacker-pass-1",
      name: "Mallory",
    });
    expect(response.status).toBe(200);
    expect(await providersOf(pool, email)).toEqual(["credential"]);
  }

  it("CONTROL: with Better Auth's local-verification gate turned off and no hook, the attack works", async () => {
    const auth = createSpikeAuth(pool, {
      account: { accountLinking: { enabled: true, requireLocalEmailVerified: false } },
    });
    const email = nextEmail();
    await attackerPreRegisters(auth, email);

    const result = await signInWithProvider(auth, PROVIDER.GOOGLE, {
      subject: "g-control",
      email,
      emailVerified: true,
      name: "Victim",
    });

    // The victim's Google identity lands in the attacker's row: this is the hijack.
    expect(result.location.pathname).toBe("/app");
    expect(result.sessionCookie).not.toBe("");
    expect(await providersOf(pool, email)).toEqual(["credential", "google"]);
  });

  it("DEFAULT (1.7.x): requireLocalEmailVerified defaults to true and refuses the implicit link", async () => {
    const auth = createSpikeAuth(pool, {
      account: { accountLinking: { enabled: true, trustedProviders: ["google", "discord"] } },
    });
    const email = nextEmail();
    await attackerPreRegisters(auth, email);
    const googleRowsBefore = await countAccounts(pool, "google");

    const result = await signInWithProvider(auth, PROVIDER.GOOGLE, {
      subject: "g-default",
      email,
      emailVerified: true,
      name: "Victim",
    });

    expect(result.location.pathname).toBe("/login");
    expect(result.location.searchParams.get("error")).toBe("account_not_linked");
    expect(result.sessionCookie).toBe("");
    expect(await providersOf(pool, email)).toEqual(["credential"]);
    expect(await countAccounts(pool, "google")).toBe(googleRowsBefore);
  });

  it("HOOK: databaseHooks.account.create.before throwing APIError aborts the link on its own", async () => {
    const auth = createSpikeAuth(pool, {
      account: { accountLinking: { enabled: true, requireLocalEmailVerified: false } },
      databaseHooks: { account: { create: { before: blockLinkIntoUnverifiedCredentialUser } } },
    });
    const email = nextEmail();
    await attackerPreRegisters(auth, email);

    const result = await signInWithProvider(auth, PROVIDER.GOOGLE, {
      subject: "g-hook",
      email,
      emailVerified: true,
      name: "Victim",
    });

    expect(result.location.pathname).toBe("/login");
    expect(result.location.searchParams.get("error")).toBe(LINK_BLOCKED_CODE);
    expect(result.sessionCookie).toBe("");
    expect(await providersOf(pool, email)).toEqual(["credential"]);
  });

  it("TRUSTED: Google user later signing in with Discord (same verified email) reaches the same user", async () => {
    const auth = createSpikeAuth(pool, {
      account: { accountLinking: { enabled: true, trustedProviders: ["google", "discord"] } },
      databaseHooks: { account: { create: { before: blockLinkIntoUnverifiedCredentialUser } } },
    });
    const email = nextEmail();

    const google = await signInWithProvider(auth, PROVIDER.GOOGLE, {
      subject: "g-trusted",
      email,
      emailVerified: true,
      name: "Owner",
    });
    expect(google.location.pathname).toBe("/app");

    const discord = await signInWithProvider(auth, PROVIDER.DISCORD, {
      subject: "175928847299117063",
      email,
      emailVerified: true,
      name: "Owner",
    });
    expect(discord.location.pathname).toBe("/app");
    expect(discord.sessionCookie).not.toBe("");
    expect(await providersOf(pool, email)).toEqual(["discord", "google"]);

    const users = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [email]);
    expect(users.rowCount).toBe(1);
  });
});
