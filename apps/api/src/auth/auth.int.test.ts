import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authPost,
  cookieHeader,
  createTestApp,
  getWith,
  signIn,
  signUp,
  type TestApp,
} from "../../test/auth-helpers";
import { useTestDatabase } from "../../test/db";
import { userInput } from "../../test/factories";

/** Any /api/v1 path: unknown ones still sit behind the session guard (no route probing). */
const PROTECTED = "/api/v1/anything";

describe("Better Auth wiring + session guard (R-AUTH-1, R-AUTH-2)", () => {
  const db = useTestDatabase();
  let t: TestApp;

  beforeAll(() => {
    t = createTestApp(db.current.url);
  });
  afterAll(async () => {
    await t.close();
  });

  async function roleOf(userId: string): Promise<string | null> {
    const { rows } = await t.database.pool.query<{ role: string | null }>(
      `SELECT role FROM "user" WHERE id = $1`,
      [userId],
    );
    return rows[0]?.role ?? null;
  }

  it("S1: email sign-up creates a role 'user' account with an active session", async () => {
    const signed = await signUp(t.app);

    expect(signed.cookie).toMatch(/vk\.session_token=/);
    expect(await roleOf(signed.id)).toBe("user");
    const res = await getWith(t.app, PROTECTED, signed.cookie);
    expect(res.status).not.toBe(401);
  });

  it("S3: wrong password and unknown email fail identically, with no session", async () => {
    const signed = await signUp(t.app);

    const wrong = await signIn(t.app, signed.email, "not-the-password");
    const unknown = await signIn(t.app, "nobody-here@example.com", "not-the-password");

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(wrong.status);
    expect(await unknown.json()).toEqual(await wrong.json());
    expect(cookieHeader(wrong)).not.toMatch(/session_token/);
    expect(cookieHeader(unknown)).not.toMatch(/session_token/);
  });

  it("S4: a duplicate email sign-up is rejected and creates nothing", async () => {
    const first = await signUp(t.app);

    const again = await authPost(t.app, "/sign-up/email", userInput({ email: first.email }));

    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(cookieHeader(again)).not.toMatch(/session_token/);
    const { rows } = await t.database.pool.query(`SELECT id FROM "user" WHERE email = $1`, [
      first.email,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("S5: after sign-out the old session cookie gets 401", async () => {
    const signed = await signUp(t.app);
    expect((await getWith(t.app, PROTECTED, signed.cookie)).status).not.toBe(401);

    const out = await authPost(t.app, "/sign-out", {}, signed.cookie);
    expect(out.status).toBe(200);

    expect((await getWith(t.app, PROTECTED, signed.cookie)).status).toBe(401);
  });

  it("signing in again yields a working session", async () => {
    const signed = await signUp(t.app);
    const res = await signIn(t.app, signed.email, signed.password);
    expect(res.status).toBe(200);
    expect((await getWith(t.app, PROTECTED, cookieHeader(res))).status).not.toBe(401);
  });

  it("R-AUTH-2 S1: no session -> 401 UNAUTHENTICATED envelope, no data", async () => {
    const res = await getWith(t.app, PROTECTED);
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorBody;
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.code).toBe(ERROR_CODE.UNAUTHENTICATED);
  });

  it("R-AUTH-2 S2: a forged session cookie -> 401", async () => {
    const res = await getWith(t.app, PROTECTED, "vk.session_token=forged.value");
    expect(res.status).toBe(401);
  });

  it("R-AUTH-2 S2: an expired session -> 401", async () => {
    const signed = await signUp(t.app);
    await t.database.pool.query(
      `UPDATE session SET expires_at = now() - interval '1 minute' WHERE user_id = $1`,
      [signed.id],
    );
    expect((await getWith(t.app, PROTECTED, signed.cookie)).status).toBe(401);
  });

  it("auth and health stay public", async () => {
    expect((await getWith(t.app, "/api/auth/ok")).status).toBe(200);
    expect((await getWith(t.app, "/healthz")).status).toBe(200);
  });
});

describe("rate limiting (design 08) is on unless disabled", () => {
  const db = useTestDatabase();
  let t: TestApp;

  beforeAll(() => {
    t = createTestApp(db.current.url, { auth: { rateLimit: true } });
  });
  afterAll(async () => {
    await t.close();
  });

  it("repeated sign-in attempts get 429", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push((await signIn(t.app, "brute@example.com", "guess-guess-guess")).status);
    }
    expect(statuses).toContain(429);
  });
});
