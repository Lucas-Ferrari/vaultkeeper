import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { stockEntry } from "@vaultkeeper/shared/schemas/stock";
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
  STOCK,
  countRows,
  createAccount,
  createEntry,
  insertGroup,
  locationId,
} from "../../../test/storage-fixtures";

describe("GET/PATCH/DELETE /stock/:id (task 4.7)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let vault1: string;
  let storm: string;
  let eternal: string;
  let inactive: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [storm = "", eternal = "", inactive = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm", referencePriceMc: "100" },
      { categorySlug: "wings", name: "Wings of Eternal" },
      { categorySlug: "wings", name: "Wings of Rust", isActive: false },
    ]);
    const acc = await createAccount(t.app, a.cookie, "Main");
    vault1 = await locationId(t.app, a.cookie, acc.id, "Vault 1");
  });
  afterAll(async () => {
    await t.close();
  });

  const newEntry = () =>
    createEntry(t.app, a.cookie, { catalogItemId: storm, storageLocationId: vault1, quantity: 2 });
  const patch = (id: string, body: unknown, cookie = a.cookie) =>
    sendJson(t.app, "PATCH", `${STOCK}/${id}`, body, cookie);

  it("GET reads the owner's entry", async () => {
    const entry = await newEntry();
    const res = await getWith(t.app, `${STOCK}/${entry.id}`, a.cookie);
    expect(res.status).toBe(200);
    expect(stockEntry.parse(await res.json())).toEqual(entry);
  });

  it("PATCH edits any field; price override changes the value", async () => {
    const entry = await newEntry();
    const res = await patch(entry.id, {
      level: 9,
      quantity: 3,
      options: "+Skill",
      notes: "for sale",
      priceMc: "50.5",
    });
    expect(res.status).toBe(200);
    expect(stockEntry.parse(await res.json())).toMatchObject({
      level: 9,
      quantity: 3,
      options: "+Skill",
      notes: "for sale",
      priceMc: "50.50",
      unitPriceMc: "50.50",
      valueMc: "151.50",
      storageLocationId: vault1,
    });
    const cleared = stockEntry.parse(await (await patch(entry.id, { priceMc: null })).json());
    expect(cleared).toMatchObject({ priceMc: null, unitPriceMc: "100.00", valueMc: "300.00" });
  });

  it("R-STK-2: the item may change only to an active item", async () => {
    const entry = await newEntry();
    const ok = await patch(entry.id, { catalogItemId: eternal });
    expect(stockEntry.parse(await ok.json())).toMatchObject({
      itemName: "Wings of Eternal",
      unitPriceMc: null,
      valueMc: null,
    });
    const bad = await patch(entry.id, { catalogItemId: inactive });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.ITEM_INACTIVE);
  });

  it("PATCH validates bounds (422)", async () => {
    const entry = await newEntry();
    expect((await patch(entry.id, { quantity: 0 })).status).toBe(422);
    expect((await patch(entry.id, {})).status).toBe(422);
  });

  it("R-STK-3 S1: DELETE removes the entry and its memberships; groups remain", async () => {
    const entry = await newEntry();
    const g1 = await insertGroup(t.database.pool, a.id, "G1", [entry.id]);
    const g2 = await insertGroup(t.database.pool, a.id, "G2", [entry.id]);
    const res = await sendJson(t.app, "DELETE", `${STOCK}/${entry.id}`, undefined, a.cookie);
    expect(res.status).toBe(204);
    expect(await countRows(t.database.pool, "stock_entries WHERE id = $1", [entry.id])).toBe(0);
    expect(
      await countRows(t.database.pool, "stock_group_entries WHERE stock_entry_id = $1", [entry.id]),
    ).toBe(0);
    expect(await countRows(t.database.pool, "stock_groups WHERE id IN ($1, $2)", [g1, g2])).toBe(2);
  });

  it("R-AUTH-5 S2: B gets 404 on GET/PATCH/DELETE and nothing changes", async () => {
    const entry = await newEntry();
    const path = `${STOCK}/${entry.id}`;
    expect((await getWith(t.app, path, b.cookie)).status).toBe(404);
    expect((await patch(entry.id, { quantity: 9 }, b.cookie)).status).toBe(404);
    expect((await sendJson(t.app, "DELETE", path, undefined, b.cookie)).status).toBe(404);
    const after = stockEntry.parse(await (await getWith(t.app, path, a.cookie)).json());
    expect(after.quantity).toBe(2);
  });

  it("unknown id is 404, malformed 422", async () => {
    expect((await getWith(t.app, `${STOCK}/${crypto.randomUUID()}`, a.cookie)).status).toBe(404);
    expect((await getWith(t.app, `${STOCK}/nope`, a.cookie)).status).toBe(422);
  });
});
