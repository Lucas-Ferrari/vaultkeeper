import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
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
  insertVault,
  locationId,
} from "../../../test/storage-fixtures";

describe("POST /stock (task 4.6, R-STK-1)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let accountId: string;
  let vault3: string;
  let storm: string;
  let inactive: string;
  let bVault: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [storm = "", inactive = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm", referencePriceMc: "100" },
      { categorySlug: "wings", name: "Wings of Rust", isActive: false },
    ]);
    accountId = (await createAccount(t.app, a.cookie, "Main")).id;
    vault3 = await locationId(t.app, a.cookie, accountId, "Vault 3");
    const bAccount = await createAccount(t.app, b.cookie, "Main");
    bVault = await locationId(t.app, b.cookie, bAccount.id, "Vault 1");
  });
  afterAll(async () => {
    await t.close();
  });

  const post = (body: unknown, cookie = a.cookie) => sendJson(t.app, "POST", STOCK, body, cookie);
  const entriesOf = (userId: string) =>
    countRows(t.database.pool, "stock_entries WHERE user_id = $1", [userId]);

  it("S1: creates Wings of Storm +13 in vault 3 and returns the row", async () => {
    const entry = await createEntry(t.app, a.cookie, {
      catalogItemId: storm,
      storageLocationId: vault3,
      quantity: 1,
      level: 13,
      options: "+Luck, Exc: Dmg+2%",
    });
    expect(entry).toMatchObject({
      catalogItemId: storm,
      itemName: "Wings of Storm",
      storageLocationId: vault3,
      gameAccountId: accountId,
      locationLabel: "Vault 3",
      level: 13,
      quantity: 1,
      options: "+Luck, Exc: Dmg+2%",
    });
  });

  it("S5: omitted price stays null and inherits the catalog price", async () => {
    const entry = await createEntry(t.app, a.cookie, {
      catalogItemId: storm,
      storageLocationId: vault3,
      quantity: 2,
    });
    expect(entry).toMatchObject({
      priceMc: null,
      unitPriceMc: "100.00",
      valueMc: "200.00",
      level: 0,
    });
  });

  it("S2-S4: invalid quantity, level and text are 422", async () => {
    const ok = { catalogItemId: storm, storageLocationId: vault3 };
    for (const body of [
      { ...ok, quantity: 0 },
      { ...ok, quantity: 1.5 },
      { ...ok, level: 16 },
      { ...ok, options: "x".repeat(501) },
      { ...ok, priceMc: "-1" },
    ]) {
      expect((await post(body)).status).toBe(422);
    }
  });

  it("S6: B's location is 404 and nothing is created", async () => {
    const before = await entriesOf(a.id);
    const res = await post({ catalogItemId: storm, storageLocationId: bVault });
    expect(res.status).toBe(404);
    expect(await entriesOf(a.id)).toBe(before);
    expect(await entriesOf(b.id)).toBe(0);
  });

  it("S7: the same item may appear twice in the same location", async () => {
    const body = { catalogItemId: storm, storageLocationId: vault3, level: 7 };
    const first = await createEntry(t.app, a.cookie, body);
    const second = await createEntry(t.app, a.cookie, body);
    expect(first.id).not.toBe(second.id);
  });

  it("R-CAT-3 S2: an inactive item is 422 ITEM_INACTIVE; an unknown one 422", async () => {
    const res = await post({ catalogItemId: inactive, storageLocationId: vault3 });
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.ITEM_INACTIVE);

    const unknown = await post({ catalogItemId: crypto.randomUUID(), storageLocationId: vault3 });
    expect(unknown.status).toBe(422);
    expect(((await unknown.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
  });

  it("R-GA-5 S3: an over-limit vault rejects new entries with 422 VAULT_OVER_LIMIT", async () => {
    const vault11 = await insertVault(t.database.pool, a.id, accountId, 11);
    const before = await entriesOf(a.id);
    const res = await post({ catalogItemId: storm, storageLocationId: vault11 });
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.VAULT_OVER_LIMIT);
    expect(await entriesOf(a.id)).toBe(before);
  });
});
