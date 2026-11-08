import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { settings } from "@vaultkeeper/shared/schemas/settings";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  getWith,
  sendJson,
  signUp,
  signUpAdmin,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { useTestDatabase } from "../../../test/db";

const SETTINGS = "/api/v1/settings";
const ADMIN_SETTINGS = "/api/v1/admin/settings";

describe("settings read / update (task 5.6, R-SET-1..3)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let user: SignedInUser;
  let admin: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    user = await signUp(t.app);
    admin = await signUpAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });

  const read = async () =>
    settings.parse(await (await getWith(t.app, SETTINGS, user.cookie)).json());
  const patch = (body: unknown, cookie = admin.cookie) =>
    sendJson(t.app, "PATCH", ADMIN_SETTINGS, body, cookie);

  it("R-SET-1 S1 / R-SET-2 S1: any user reads the fresh defaults", async () => {
    const res = await getWith(t.app, SETTINGS, user.cookie);
    expect(res.status).toBe(200);
    expect(settings.parse(await res.json())).toMatchObject({
      mcToMpRate: "7.5000",
      vaultCount: 10,
      updatedBy: null,
    });
    expect((await getWith(t.app, SETTINGS)).status).toBe(401);
  });

  it("R-SET-2 S2: a plain user updating is 403, unchanged", async () => {
    const res = await patch({ mcToMpRate: "9" }, user.cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.FORBIDDEN);
    expect((await read()).mcToMpRate).toBe("7.5000");
  });

  it("R-SET-1 S2/S3: bad rate or vault_count is 422, unchanged", async () => {
    for (const body of [
      { mcToMpRate: "0" },
      { mcToMpRate: "-1" },
      { mcToMpRate: "abc" },
      { vaultCount: 0 },
      { vaultCount: 51 },
      { vaultCount: 10.5 },
      { mcToMpRate: "8", vaultCount: 51 },
    ]) {
      const res = await patch(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    expect(await read()).toMatchObject({ mcToMpRate: "7.5000", vaultCount: 10 });
  });

  it("R-SET-3 S2: an update records updated_by and updated_at", async () => {
    const before = await read();
    const res = await patch({ mcToMpRate: "8" });
    expect(res.status).toBe(200);
    const after = settings.parse(await res.json());
    expect(after).toMatchObject({ mcToMpRate: "8.0000", vaultCount: 10, updatedBy: admin.id });
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
    expect(await read()).toEqual(after);
  });
});
