import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { catalogItem, catalogItemPage } from "@vaultkeeper/shared/schemas/catalog";
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
import { insertCategories, insertItems, insertStockEntryFor } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";

const ADMIN_ITEMS = "/api/v1/admin/catalog/items";
const ITEMS = "/api/v1/catalog/items";

describe("catalog item lifecycle + user reads (task 3.4)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let admin: SignedInUser;
  let member: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    admin = await signUpAdmin(t);
    member = await signUp(t.app);
  });
  afterAll(async () => {
    await t.close();
  });

  async function userListIds(): Promise<string[]> {
    const res = await getWith(t.app, `${ITEMS}?limit=50`, member.cookie);
    expect(res.status).toBe(200);
    return catalogItemPage.parse(await res.json()).items.map((item) => item.id);
  }

  async function exists(id: string): Promise<boolean> {
    const { rowCount } = await t.database.pool.query("SELECT 1 FROM catalog_items WHERE id = $1", [
      id,
    ]);
    return rowCount === 1;
  }

  const setActive = (id: string, isActive: boolean, cookie = admin.cookie) =>
    sendJson(t.app, "PATCH", `${ADMIN_ITEMS}/${id}`, { isActive }, cookie);
  const remove = (id: string, cookie = admin.cookie) =>
    sendJson(t.app, "DELETE", `${ADMIN_ITEMS}/${id}`, undefined, cookie);

  it("a user lists only active items (R-AUTH-4 S3)", async () => {
    const [active, inactive] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Light" },
      { categorySlug: "wings", name: "Wings of Shadow", isActive: false },
    ]);
    const res = await getWith(t.app, `${ITEMS}?limit=50`, member.cookie);
    const page = catalogItemPage.parse(await res.json());
    expect(page.items.map((item) => item.id)).toContain(active);
    expect(page.items.map((item) => item.id)).not.toContain(inactive);
    expect(page.items.every((item) => item.isActive)).toBe(true);
    expect(page.total).toBe(page.items.length);
  });

  it("a user reads an active item by id; inactive or unknown ids are 404", async () => {
    const [active, inactive] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Glass", referencePriceMc: "10.5" },
      { categorySlug: "wings", name: "Wings of Rust", isActive: false },
    ]);
    const ok = await getWith(t.app, `${ITEMS}/${active}`, member.cookie);
    expect(ok.status).toBe(200);
    expect(catalogItem.parse(await ok.json())).toMatchObject({
      id: active,
      name: "Wings of Glass",
      referencePriceMc: "10.50",
    });

    expect((await getWith(t.app, `${ITEMS}/${inactive}`, member.cookie)).status).toBe(404);
    expect((await getWith(t.app, `${ITEMS}/${crypto.randomUUID()}`, member.cookie)).status).toBe(
      404,
    );
    expect((await getWith(t.app, `${ITEMS}/not-a-uuid`, member.cookie)).status).toBe(422);
  });

  it("deactivate hides an item from users; reactivate makes it visible again (R-CAT-3 S5)", async () => {
    const [id = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Phases" },
    ]);
    expect((await setActive(id, false)).status).toBe(200);
    expect(await userListIds()).not.toContain(id);
    expect((await getWith(t.app, `${ITEMS}/${id}`, member.cookie)).status).toBe(404);

    expect((await setActive(id, true)).status).toBe(200);
    expect(await userListIds()).toContain(id);
    expect((await getWith(t.app, `${ITEMS}/${id}`, member.cookie)).status).toBe(200);
  });

  it("deleting an item referenced by stock -> 409 REFERENCED, item kept (R-CAT-3 S4)", async () => {
    const [id = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Owners" },
    ]);
    await insertStockEntryFor(t.database.pool, id);

    const res = await remove(id);
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe(ERROR_CODE.REFERENCED);
    expect(body.error.message).toMatch(/deactivate/i);
    expect(await exists(id)).toBe(true);
  });

  it("deleting an unreferenced item -> 204 and it is gone; again -> 404", async () => {
    const [id = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Nobody" },
    ]);
    const res = await remove(id);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(await exists(id)).toBe(false);
    expect((await remove(id)).status).toBe(404);
  });

  it("a user cannot delete or deactivate: 403 and nothing changes (R-AUTH-4 S1)", async () => {
    const [id = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Keep" },
    ]);
    expect((await remove(id, member.cookie)).status).toBe(403);
    expect((await setActive(id, false, member.cookie)).status).toBe(403);
    const { rows } = await t.database.pool.query<{ is_active: boolean }>(
      "SELECT is_active FROM catalog_items WHERE id = $1",
      [id],
    );
    expect(rows).toEqual([{ is_active: true }]);
  });
});
