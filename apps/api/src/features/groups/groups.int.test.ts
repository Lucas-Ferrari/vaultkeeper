import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { stockGroup, stockGroupDetail } from "@vaultkeeper/shared/schemas/groups";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  getWith,
  sendJson,
  signUp,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { insertCategories, insertItems } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";
import {
  countRows,
  createAccount,
  createEntry,
  insertGroup,
  locationId,
} from "../../../test/storage-fixtures";

const GROUPS = "/api/v1/groups";
const ZERO = { totalMc: "0.00", totalMp: "0.00", pricedCount: 0, unpricedCount: 0, partial: false };

describe("groups CRUD (task 5.3, R-GRP-1)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let item: string;
  let vault1: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [item = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm", referencePriceMc: "100" },
    ]);
    const main = await createAccount(t.app, a.cookie, "Main");
    vault1 = await locationId(t.app, a.cookie, main.id, "Vault 1");
  });
  afterAll(async () => {
    await t.close();
  });

  const create = (body: unknown, cookie = a.cookie) =>
    sendJson(t.app, "POST", GROUPS, body, cookie);

  it("S1: a new group is listed with 0 entries and total 0", async () => {
    const res = await create({ name: "Dark Phoenix Set", description: "full set" });
    expect(res.status).toBe(201);
    const created = stockGroup.parse(await res.json());
    expect(created).toMatchObject({ name: "Dark Phoenix Set", description: "full set" });
    expect(created).toMatchObject({ entryCount: 0, totals: ZERO });
    const list = z.array(stockGroup).parse(await (await getWith(t.app, GROUPS, a.cookie)).json());
    expect(list.find((g) => g.id === created.id)).toMatchObject({ entryCount: 0, totals: ZERO });
  });

  it("S2: 'dark phoenix set' again is 409 CONFLICT; another user may reuse it", async () => {
    const res = await create({ name: "dark phoenix set" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.CONFLICT);
    expect((await create({ name: "Dark Phoenix Set" }, b.cookie)).status).toBe(201);
  });

  it("validates name 1..60 and description <= 500 (422)", async () => {
    expect((await create({ name: " " })).status).toBe(422);
    expect((await create({ name: "x".repeat(61) })).status).toBe(422);
    expect((await create({ name: "Ok", description: "x".repeat(501) })).status).toBe(422);
  });

  it("lists only own groups, by name; GET by id returns the detail", async () => {
    await create({ name: "Alpha" });
    const list = z.array(stockGroup).parse(await (await getWith(t.app, GROUPS, a.cookie)).json());
    expect(list.map((g) => g.name)).toEqual(["Alpha", "Dark Phoenix Set"]);
    const [first] = list;
    const res = await getWith(t.app, `${GROUPS}/${first?.id}`, a.cookie);
    expect(res.status).toBe(200);
    expect(stockGroupDetail.parse(await res.json())).toMatchObject({ name: "Alpha", entries: [] });
  });

  it("PATCH renames / describes; a duplicate name is 409", async () => {
    const id = stockGroup.parse(await (await create({ name: "Trade" })).json()).id;
    const res = await sendJson(
      t.app,
      "PATCH",
      `${GROUPS}/${id}`,
      { name: "Trade Bundle", description: null },
      a.cookie,
    );
    expect(res.status).toBe(200);
    expect(stockGroup.parse(await res.json())).toMatchObject({
      name: "Trade Bundle",
      description: null,
    });
    const dup = await sendJson(t.app, "PATCH", `${GROUPS}/${id}`, { name: "ALPHA" }, a.cookie);
    expect(dup.status).toBe(409);
  });

  it("S3: deleting a group keeps its entries unchanged", async () => {
    const entry = await createEntry(t.app, a.cookie, {
      catalogItemId: item,
      storageLocationId: vault1,
    });
    const id = await insertGroup(t.database.pool, a.id, "Doomed", [entry.id]);
    const res = await sendJson(t.app, "DELETE", `${GROUPS}/${id}`, undefined, a.cookie);
    expect(res.status).toBe(204);
    expect(await countRows(t.database.pool, "stock_groups WHERE id = $1", [id])).toBe(0);
    expect(await countRows(t.database.pool, "stock_entries WHERE id = $1", [entry.id])).toBe(1);
  });

  it("B by id (GET/PATCH/DELETE) and unknown ids are 404", async () => {
    const id = await insertGroup(t.database.pool, a.id, "Mine");
    expect((await getWith(t.app, `${GROUPS}/${id}`, b.cookie)).status).toBe(404);
    expect(
      (await sendJson(t.app, "PATCH", `${GROUPS}/${id}`, { name: "X" }, b.cookie)).status,
    ).toBe(404);
    expect((await sendJson(t.app, "DELETE", `${GROUPS}/${id}`, undefined, b.cookie)).status).toBe(
      404,
    );
    expect(await countRows(t.database.pool, "stock_groups WHERE id = $1", [id])).toBe(1);
    expect((await getWith(t.app, `${GROUPS}/${crypto.randomUUID()}`, a.cookie)).status).toBe(404);
  });
});
