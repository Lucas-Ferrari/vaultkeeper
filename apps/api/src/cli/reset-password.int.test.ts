import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, getWith, signIn, signUp, type TestApp } from "../../test/auth-helpers";
import { memoryIo } from "../../test/cli-io";
import { useTestDatabase } from "../../test/db";
import {
  FAKE_OAUTH_ENV,
  oauthServer,
  PROVIDER,
  signInWithProvider,
  type AuthHandler,
} from "../../test/fake-oauth";
import { EXIT } from "./io";
import { GENERATED_PASSWORD_LENGTH, run as resetPassword } from "./reset-password";

/** reset-password (R-AUTH-6, design 08b, primitive from spike 2.2): the only reset path (no SMTP). */
describe("reset-password CLI", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let server: AuthHandler;

  beforeAll(() => {
    oauthServer.listen({ onUnhandledFrame: "error" });
    t = createTestApp(db.current.url, { env: FAKE_OAUTH_ENV });
    server = { handler: async (request) => t.app.request(request) };
  });
  afterAll(async () => {
    oauthServer.close();
    await t.close();
  });

  function deps(io = memoryIo(), stdin = "") {
    return { auth: t.auth, io, readStdin: async () => stdin };
  }

  /** Every account row (provider + password hash): "nothing changes" means this is identical. */
  async function accountsSnapshot() {
    const { rows } = await t.database.pool.query<{ userId: string; providerId: string }>(
      `SELECT user_id AS "userId", provider_id AS "providerId", password FROM account
       ORDER BY user_id, provider_id`,
    );
    return rows;
  }

  it("S1: prints a new password once; old fails, new signs in, the previous session gets 401", async () => {
    const signed = await signUp(t.app);
    expect((await getWith(t.app, "/api/v1/me", signed.cookie)).status).toBe(200);
    const io = memoryIo();

    const code = await resetPassword([signed.email], deps(io));

    expect(code).toBe(EXIT.OK);
    expect(io.stdout).toHaveLength(1);
    const newPassword = io.stdout[0] ?? "";
    expect(newPassword).toMatch(new RegExp(`^[A-Za-z0-9_-]{${GENERATED_PASSWORD_LENGTH}}$`));
    expect(io.all().split(newPassword)).toHaveLength(2); // exactly once, and only on stdout
    expect(io.stderr.join("\n")).toContain(signed.email);

    expect((await signIn(t.app, signed.email, signed.password)).status).toBe(401);
    expect((await signIn(t.app, signed.email, newPassword)).status).toBe(200);
    expect((await getWith(t.app, "/api/v1/me", signed.cookie)).status).toBe(401);
  });

  it("generates a different password every run", async () => {
    const signed = await signUp(t.app);
    const first = memoryIo();
    const second = memoryIo();

    await resetPassword([signed.email], deps(first));
    await resetPassword([signed.email], deps(second));

    expect(first.stdout[0]).not.toBe(second.stdout[0]);
  });

  it("--password-stdin sets the given password (trailing newline ignored) and never echoes it", async () => {
    const signed = await signUp(t.app);
    const chosen = "operator-chosen-pass";
    const io = memoryIo();

    const code = await resetPassword([signed.email, "--password-stdin"], deps(io, `${chosen}\n`));

    expect(code).toBe(EXIT.OK);
    expect(io.all()).not.toContain(chosen);
    expect((await signIn(t.app, signed.email, chosen)).status).toBe(200);
    expect((await signIn(t.app, signed.email, signed.password)).status).toBe(401);
    expect((await getWith(t.app, "/api/v1/me", signed.cookie)).status).toBe(401);
  });

  it.each([
    ["shorter than 10 chars", "short-pw1"],
    ["longer than 128 chars", "x".repeat(129)],
    ["empty", ""],
  ])("--password-stdin rejects a password %s: exit 1, nothing changes", async (_label, input) => {
    const signed = await signUp(t.app);
    const before = await accountsSnapshot();
    const io = memoryIo();

    const code = await resetPassword([signed.email, "--password-stdin"], deps(io, `${input}\n`));

    expect(code).toBe(EXIT.FAILURE);
    expect(io.stderr.join("\n")).toMatch(/password must be 10-128 characters/i);
    expect(await accountsSnapshot()).toEqual(before);
    expect((await getWith(t.app, "/api/v1/me", signed.cookie)).status).toBe(200);
  });

  it("S2: an OAuth-only user -> exit 1 with a clear message, no password account created", async () => {
    const google = await signInWithProvider(server, PROVIDER.GOOGLE, {
      subject: "g-oauth-only",
      email: "oauth-only@example.com",
      emailVerified: true,
      name: "OAuth Only",
    });
    expect((await getWith(t.app, "/api/v1/me", google.sessionCookie)).status).toBe(200);
    const before = await accountsSnapshot();
    const io = memoryIo();

    const code = await resetPassword(["oauth-only@example.com"], deps(io));

    expect(code).toBe(EXIT.FAILURE);
    expect(io.stdout).toEqual([]);
    expect(io.stderr.join("\n")).toMatch(/has no password.*Google or Discord/i);
    expect(await accountsSnapshot()).toEqual(before);
    expect((await getWith(t.app, "/api/v1/me", google.sessionCookie)).status).toBe(200);
  });

  it("S3: unknown email -> exit 1, nothing changes", async () => {
    await signUp(t.app);
    const before = await accountsSnapshot();
    const io = memoryIo();

    const code = await resetPassword(["nobody@example.com"], deps(io));

    expect(code).toBe(EXIT.FAILURE);
    expect(io.stdout).toEqual([]);
    expect(io.stderr.join("\n")).toContain("No user with email nobody@example.com");
    expect(await accountsSnapshot()).toEqual(before);
  });

  it.each([[[]], [["a@x.com", "b@x.com"]], [["a@x.com", "--password"]], [["nope"]]])(
    "usage error for args %j -> exit 1, nothing changes",
    async (args) => {
      const before = await accountsSnapshot();
      const io = memoryIo();

      const code = await resetPassword(args, deps(io));

      expect(code).toBe(EXIT.FAILURE);
      expect(io.stderr.join("\n")).toMatch(/usage: reset-password <email> \[--password-stdin\]/i);
      expect(await accountsSnapshot()).toEqual(before);
    },
  );
});
