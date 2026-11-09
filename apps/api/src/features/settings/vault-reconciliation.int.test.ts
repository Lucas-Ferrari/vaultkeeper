import { valuationSummary } from "@vaultkeeper/shared/schemas/valuation";
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
import { insertCategories, insertItems } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";
import {
  countRows,
  createAccount,
  createEntry,
  getStorage,
  locationId,
} from "../../../test/storage-fixtures";

const ADMIN_SETTINGS = "/api/v1/admin/settings";

describe("vault_count reconciliation (task 5.7, R-GA-5, R-SET-3)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let admin: SignedInUser;
  let mainId: string;
  let bAccountId: string;
  let item: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    admin = await signUpAdmin(t);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [item = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm", referencePriceMc: "100" },
    ]);
    mainId = (await createAccount(t.app, a.cookie, "Main")).id;
    bAccountId = (await createAccount(t.app, b.cookie, "Main")).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const setVaults = async (vaultCount: number) => {
    const res = await sendJson(t.app, "PATCH", ADMIN_SETTINGS, { vaultCount }, admin.cookie);
    expect(res.status).toBe(200);
  };
  const vaults = async (cookie: string, accountId: string) =>
    (await getStorage(t.app, cookie, accountId)).locations
      .filter((l) => l.kind === "vault")
      .map((l) => [l.vaultNumber, l.overLimit] as const);
  const range = (n: number) => Array.from({ length: n }, (_, i) => [i + 1, false] as const);
  const stockCount = () => countRows(t.database.pool, "stock_entries", []);
  const totals = async () =>
    valuationSummary.parse(
      await (await getWith(t.app, "/api/v1/valuation/summary", a.cookie)).json(),
    ).totals;

  it("S1: 10 -> 12 gives every account vaults 1..12", async () => {
    await setVaults(12);
    expect(await vaults(a.cookie, mainId)).toEqual(range(12));
    expect(await vaults(b.cookie, bAccountId)).toEqual(range(12));
  });

  it("S2/S5: vault 10 has stock, set 8 -> empty 9..12 removed, 10 kept over limit, no stock lost", async () => {
    await setVaults(10);
    const vault10 = await locationId(t.app, a.cookie, mainId, "Vault 10");
    await createEntry(t.app, a.cookie, {
      catalogItemId: item,
      storageLocationId: vault10,
      quantity: 2,
    });
    const before = { stock: await stockCount(), totals: await totals() };
    await setVaults(8);
    expect(await vaults(a.cookie, mainId)).toEqual([...range(8), [10, true]]);
    expect(await vaults(b.cookie, bAccountId)).toEqual(range(8));
    expect(await stockCount()).toBe(before.stock);
    expect(await totals()).toEqual(before.totals);
  });

  it("S4: raising back to 10 recreates 9 and vault 10 is no longer flagged", async () => {
    const stock = await stockCount();
    await setVaults(10);
    expect(await vaults(a.cookie, mainId)).toEqual(range(10));
    expect(await stockCount()).toBe(stock);
  });

  it("a new account after the change gets the current count", async () => {
    await setVaults(3);
    const fresh = await createAccount(t.app, b.cookie, "Fresh");
    expect(await vaults(b.cookie, fresh.id)).toEqual(range(3));
    await setVaults(10);
  });
});
