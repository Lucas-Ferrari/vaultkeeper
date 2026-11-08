import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { itemCategory } from "@vaultkeeper/shared/schemas/catalog";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
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

const ADMIN_CATEGORIES = "/api/v1/admin/catalog/categories";
const CATEGORIES = "/api/v1/catalog/categories";

describe("catalog categories (task 3.3)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let admin: SignedInUser;
  let member: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    admin = await signUpAdmin(t);
    member = await signUp(t.app);
  });
  afterAll(async () => {
    await t.close();
  });

  const post = (body: unknown, cookie = admin.cookie) =>
    sendJson(t.app, "POST", ADMIN_CATEGORIES, body, cookie);
  const patch = (slug: string, body: unknown, cookie = admin.cookie) =>
    sendJson(t.app, "PATCH", `${ADMIN_CATEGORIES}/${slug}`, body, cookie);

  async function categoryCount(): Promise<number> {
    const { rows } = await t.database.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM item_categories",
    );
    return rows[0]?.n ?? 0;
  }

  it("admin creates a category (201, shared contract)", async () => {
    const res = await post({ slug: "wings", name: " Wings ", icon: "wings", sortOrder: 2 });
    expect(res.status).toBe(201);
    expect(itemCategory.parse(await res.json())).toEqual({
      slug: "wings",
      name: "Wings",
      icon: "wings",
      sortOrder: 2,
    });
  });

  it("duplicate slug -> 409 CONFLICT", async () => {
    const res = await post({ slug: "wings", name: "Other", icon: "x" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ApiErrorBody).error).toMatchObject({
      code: ERROR_CODE.CONFLICT,
      details: { field: "slug" },
    });
  });

  it("bad slug -> 422 with a slug field error, nothing created", async () => {
    const before = await categoryCount();
    const res = await post({ slug: "Bad Slug", name: "Bad", icon: "b" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as ApiErrorBody;
    const details = body.error.details as { issues: { path: string[] }[] };
    expect(details.issues.map((issue) => issue.path.join("."))).toEqual(["slug"]);
    expect(await categoryCount()).toBe(before);
  });

  it("admin patches name/icon/sortOrder; unknown slug -> 404; empty patch -> 422", async () => {
    await post({ slug: "swords", name: "Swords", icon: "sword", sortOrder: 5 });
    const res = await patch("swords", { name: "Blades", sortOrder: 1 });
    expect(res.status).toBe(200);
    expect(itemCategory.parse(await res.json())).toEqual({
      slug: "swords",
      name: "Blades",
      icon: "sword",
      sortOrder: 1,
    });

    expect((await patch("nope", { name: "X" })).status).toBe(404);
    expect((await patch("swords", {})).status).toBe(422);
  });

  it("a user cannot create or patch categories: 403 and nothing changes (R-AUTH-4 S1)", async () => {
    const before = await categoryCount();
    expect((await post({ slug: "pets", name: "Pets", icon: "pet" }, member.cookie)).status).toBe(
      403,
    );
    expect(await categoryCount()).toBe(before);

    expect((await patch("wings", { name: "Hijacked" }, member.cookie)).status).toBe(403);
    const { rows } = await t.database.pool.query<{ name: string }>(
      "SELECT name FROM item_categories WHERE slug = 'wings'",
    );
    expect(rows[0]?.name).toBe("Wings");
  });

  it("any signed-in user lists categories ordered by sort_order, then name", async () => {
    await post({ slug: "armors", name: "Armors", icon: "armor", sortOrder: 2 });
    await post({ slug: "axes", name: "Axes", icon: "axe", sortOrder: 0 });

    const res = await getWith(t.app, CATEGORIES, member.cookie);
    expect(res.status).toBe(200);
    const list = z.array(itemCategory).parse(await res.json());
    expect(list.map((category) => category.slug)).toEqual(["axes", "swords", "armors", "wings"]);

    expect((await getWith(t.app, CATEGORIES)).status).toBe(401);
  });
});
