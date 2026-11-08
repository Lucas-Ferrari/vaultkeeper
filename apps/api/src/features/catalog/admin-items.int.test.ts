import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import {
  catalogItem,
  catalogItemPage,
  type CatalogItem,
} from "@vaultkeeper/shared/schemas/catalog";
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
import { insertCategories } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";

const ITEMS = "/api/v1/admin/catalog/items";

describe("admin catalog items: create / list / patch (task 3.2)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let admin: SignedInUser;
  let member: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    await insertCategories(t.database.pool, [
      { slug: "wings", name: "Wings", icon: "wings" },
      { slug: "swords", name: "Swords", icon: "sword" },
    ]);
    admin = await signUpAdmin(t);
    member = await signUp(t.app);
  });
  afterAll(async () => {
    await t.close();
  });

  async function create(body: unknown, cookie = admin.cookie): Promise<Response> {
    return sendJson(t.app, "POST", ITEMS, body, cookie);
  }

  async function createOk(body: unknown): Promise<CatalogItem> {
    const res = await create(body);
    expect(res.status, await res.clone().text()).toBe(201);
    return catalogItem.parse(await res.json());
  }

  async function issuePaths(res: Response): Promise<string[]> {
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
    const details = body.error.details as { issues: { path: PropertyKey[] }[] };
    return details.issues.map((issue) => issue.path.join("."));
  }

  async function adminList(query: string): Promise<CatalogItem[]> {
    const res = await getWith(t.app, `${ITEMS}?${query}`, admin.cookie);
    expect(res.status).toBe(200);
    return catalogItemPage.parse(await res.json()).items;
  }

  async function countItems(): Promise<number> {
    const { rows } = await t.database.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM catalog_items",
    );
    return rows[0]?.n ?? 0;
  }

  it("creates an active item with a null price, source admin (R-CAT-1 S1)", async () => {
    const item = await createOk({ categorySlug: "wings", name: "  Wings of Storm " });
    expect(item).toMatchObject({
      categorySlug: "wings",
      name: "Wings of Storm",
      isActive: true,
      referencePriceMc: null,
      imageKey: null,
      source: "admin",
    });
  });

  it("rejects a duplicate name in the same category, case- and accent-insensitive: 409 (S2)", async () => {
    for (const name of ["wings of storm", "WÍNGS OF STÓRM"]) {
      const res = await create({ categorySlug: "wings", name });
      expect(res.status).toBe(409);
      expect(((await res.json()) as ApiErrorBody).error).toMatchObject({
        code: ERROR_CODE.CONFLICT,
        details: { field: "name" },
      });
    }
  });

  it("allows the same name in another category (S3)", async () => {
    await createOk({ categorySlug: "swords", name: "Wings of Storm" });
  });

  it("422 with field errors for negative/non-numeric price and empty name (S4)", async () => {
    const before = await countItems();
    const res = await create({ categorySlug: "wings", name: " ", referencePriceMc: "-1" });
    expect(res.status).toBe(422);
    expect(await issuePaths(res)).toEqual(expect.arrayContaining(["name", "referencePriceMc"]));

    const nonNumeric = await create({ categorySlug: "wings", name: "X", referencePriceMc: "abc" });
    expect(nonNumeric.status).toBe(422);
    expect(await issuePaths(nonNumeric)).toEqual(["referencePriceMc"]);
    expect(await countItems()).toBe(before);
  });

  it("422 with a categorySlug field error for an unknown category (S4)", async () => {
    const res = await create({ categorySlug: "pets", name: "Uniria" });
    expect(res.status).toBe(422);
    expect(await issuePaths(res)).toEqual(["categorySlug"]);
  });

  it("keeps the price exact: 1500.5 reads back as 1500.50 (S5)", async () => {
    const item = await createOk({
      categorySlug: "swords",
      name: "Sword of Precision",
      referencePriceMc: "1500.5",
    });
    expect(item.referencePriceMc).toBe("1500.50");
    const listed = await adminList("category=swords&limit=50");
    expect(listed.find((row) => row.id === item.id)?.referencePriceMc).toBe("1500.50");
  });

  it("filters by active=false: only inactive items return (R-CAT-2 S2)", async () => {
    const hidden = await createOk({
      categorySlug: "wings",
      name: "Wings of Ruin",
      isActive: false,
    });
    const inactive = await adminList("active=false&limit=50");
    expect(inactive.map((row) => row.id)).toContain(hidden.id);
    expect(inactive.every((row) => !row.isActive)).toBe(true);

    const active = await adminList("active=true&limit=50");
    expect(active.map((row) => row.id)).not.toContain(hidden.id);
    expect(active.every((row) => row.isActive)).toBe(true);

    const all = await adminList("includeInactive=true&limit=50");
    expect(all.some((row) => !row.isActive) && all.some((row) => row.isActive)).toBe(true);
  });

  it("patches any field; a rename is visible on the next GET (R-CAT-2)", async () => {
    const item = await createOk({ categorySlug: "wings", name: "Wings of Dawn" });
    const res = await sendJson(
      t.app,
      "PATCH",
      `${ITEMS}/${item.id}`,
      { name: "Wings of Dusk", referencePriceMc: "250", categorySlug: "swords" },
      admin.cookie,
    );
    expect(res.status).toBe(200);
    expect(catalogItem.parse(await res.json())).toMatchObject({
      id: item.id,
      name: "Wings of Dusk",
      referencePriceMc: "250.00",
      categorySlug: "swords",
    });

    const listed = await adminList("includeInactive=true&limit=50&category=swords");
    expect(listed.find((row) => row.id === item.id)?.name).toBe("Wings of Dusk");

    const cleared = await sendJson(
      t.app,
      "PATCH",
      `${ITEMS}/${item.id}`,
      { referencePriceMc: null, isActive: false },
      admin.cookie,
    );
    expect(catalogItem.parse(await cleared.json())).toMatchObject({
      referencePriceMc: null,
      isActive: false,
    });
  });

  it("PATCH: rename into an existing name -> 409, unknown category -> 422, unknown id -> 404", async () => {
    const item = await createOk({ categorySlug: "wings", name: "Wings of Mist" });
    const dup = await sendJson(
      t.app,
      "PATCH",
      `${ITEMS}/${item.id}`,
      { name: "wings of storm" },
      admin.cookie,
    );
    expect(dup.status).toBe(409);

    const badCategory = await sendJson(
      t.app,
      "PATCH",
      `${ITEMS}/${item.id}`,
      { categorySlug: "pets" },
      admin.cookie,
    );
    expect(badCategory.status).toBe(422);
    expect(await issuePaths(badCategory)).toEqual(["categorySlug"]);

    const missing = await sendJson(
      t.app,
      "PATCH",
      `${ITEMS}/${crypto.randomUUID()}`,
      { name: "Ghost" },
      admin.cookie,
    );
    expect(missing.status).toBe(404);

    const empty = await sendJson(t.app, "PATCH", `${ITEMS}/${item.id}`, {}, admin.cookie);
    expect(empty.status).toBe(422);
  });

  it("a non-uuid id is a 422, never a 500", async () => {
    const res = await sendJson(t.app, "PATCH", `${ITEMS}/not-a-uuid`, { name: "X" }, admin.cookie);
    expect(res.status).toBe(422);
  });

  describe("admin-only (R-AUTH-4 S1)", () => {
    it("a user POST -> 403 and nothing is created", async () => {
      const before = await countItems();
      const res = await create({ categorySlug: "wings", name: "Wings of Theft" }, member.cookie);
      expect(res.status).toBe(403);
      expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.FORBIDDEN);
      expect(await countItems()).toBe(before);
    });

    it("a user PATCH -> 403 and the item is unchanged", async () => {
      const item = await createOk({ categorySlug: "wings", name: "Wings of Guard" });
      const res = await sendJson(
        t.app,
        "PATCH",
        `${ITEMS}/${item.id}`,
        { name: "Hijacked", isActive: false },
        member.cookie,
      );
      expect(res.status).toBe(403);
      const { rows } = await t.database.pool.query<{ name: string; is_active: boolean }>(
        "SELECT name, is_active FROM catalog_items WHERE id = $1",
        [item.id],
      );
      expect(rows[0]).toEqual({ name: "Wings of Guard", is_active: true });
    });

    it("a user cannot use the admin list (403); no session -> 401", async () => {
      expect((await getWith(t.app, ITEMS, member.cookie)).status).toBe(403);
      expect((await getWith(t.app, ITEMS)).status).toBe(401);
      expect((await create({ categorySlug: "wings", name: "Anon" }, "")).status).toBe(401);
    });
  });
});
