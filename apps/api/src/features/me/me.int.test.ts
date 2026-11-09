import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { meResponse } from "@vaultkeeper/shared/schemas/me";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  getWith,
  signUp,
  signUpAdmin,
  type TestApp,
} from "../../../test/auth-helpers";
import { useTestDatabase } from "../../../test/db";

describe("GET /api/v1/me (R-AUTH-3 S1)", () => {
  const db = useTestDatabase();
  let t: TestApp;

  beforeAll(() => {
    t = createTestApp(db.current.url);
  });
  afterAll(async () => {
    await t.close();
  });

  it("returns the signed-in user's id, email and role 'user', matching the shared contract", async () => {
    const signed = await signUp(t.app);

    const res = await getWith(t.app, "/api/v1/me", signed.cookie);

    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(meResponse.parse(body)).toEqual({
      id: signed.id,
      email: signed.email,
      name: expect.any(String),
      role: "user",
    });
    expect(Object.keys(body as object).sort()).toEqual(["email", "id", "name", "role"]);
  });

  it("reports role 'admin' for an admin", async () => {
    const admin = await signUpAdmin(t);
    const res = await getWith(t.app, "/api/v1/me", admin.cookie);
    expect(meResponse.parse(await res.json()).role).toBe("admin");
  });

  it("401 without a session", async () => {
    const res = await getWith(t.app, "/api/v1/me");
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.UNAUTHENTICATED);
  });
});
