import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authPost,
  createTestApp,
  signUp,
  signUpAdmin,
  type TestApp,
} from "../../test/auth-helpers";
import { useTestDatabase } from "../../test/db";

/** Better Auth admin plugin endpoint (design 03: /api/auth/admin/*). */
const SET_ROLE = "/admin/set-role";

describe("role changes are admin-only (R-AUTH-3 S2)", () => {
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

  it("a user promoting themselves gets 403 and stays 'user'", async () => {
    const self = await signUp(t.app);

    const res = await authPost(t.app, SET_ROLE, { userId: self.id, role: "admin" }, self.cookie);

    expect(res.status).toBe(403);
    expect(await roleOf(self.id)).toBe("user");
  });

  it("a user changing someone else's role gets 403 and nothing changes", async () => {
    const actor = await signUp(t.app);
    const target = await signUpAdmin(t);

    const res = await authPost(t.app, SET_ROLE, { userId: target.id, role: "user" }, actor.cookie);

    expect(res.status).toBe(403);
    expect(await roleOf(target.id)).toBe("admin");
  });

  it("without a session the endpoint refuses (401) and nothing changes", async () => {
    const target = await signUp(t.app);
    const res = await authPost(t.app, SET_ROLE, { userId: target.id, role: "admin" });
    expect(res.status).toBe(401);
    expect(await roleOf(target.id)).toBe("user");
  });

  it("an admin can promote and demote another user", async () => {
    const admin = await signUpAdmin(t);
    const target = await signUp(t.app);

    const up = await authPost(t.app, SET_ROLE, { userId: target.id, role: "admin" }, admin.cookie);
    expect(up.status).toBe(200);
    expect(await roleOf(target.id)).toBe("admin");

    const down = await authPost(t.app, SET_ROLE, { userId: target.id, role: "user" }, admin.cookie);
    expect(down.status).toBe(200);
    expect(await roleOf(target.id)).toBe("user");
  });
});
