import { stockPage, type StockEntry } from "@vaultkeeper/shared/schemas/stock";
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
  STOCK,
  createAccount,
  createCharacter,
  createEntry,
  insertGroup,
  locationId,
} from "../../../test/storage-fixtures";

describe("GET /stock list + filters (task 4.9, R-STK-4)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let admin: SignedInUser;
  let mainId: string;
  let altId: string;
  let darkLordId: string;
  let vault1: string;
  let storm: string;
  let excalibur: string;
  let inactiveLater: string;
  const created: StockEntry[] = [];

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    admin = await signUpAdmin(t);
    await insertCategories(t.database.pool, [
      { slug: "wings", name: "Wings", icon: "wings" },
      { slug: "swords", name: "Swords", icon: "sword" },
    ]);
    [storm = "", excalibur = "", inactiveLater = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm", referencePriceMc: "100" },
      { categorySlug: "swords", name: "Excalibur" },
      { categorySlug: "wings", name: "Wings of Heaven", referencePriceMc: "5" },
    ]);
    mainId = (await createAccount(t.app, a.cookie, "Main")).id;
    altId = (await createAccount(t.app, a.cookie, "Alt")).id;
    darkLordId = (await createCharacter(t.app, a.cookie, altId, "DarkLord")).id;
    vault1 = await locationId(t.app, a.cookie, mainId, "Vault 1");
    const dlInv = await locationId(t.app, a.cookie, altId, "Inventory – DarkLord");
    const altVault = await locationId(t.app, a.cookie, altId, "Vault 1");

    const add = async (catalogItemId: string, storageLocationId: string, quantity = 1) => {
      created.push(
        await createEntry(t.app, a.cookie, { catalogItemId, storageLocationId, quantity }),
      );
    };
    await add(storm, vault1, 2);
    await add(excalibur, vault1);
    await add(storm, dlInv);
    await add(inactiveLater, altVault, 3);
    await add(excalibur, altVault);
  });
  afterAll(async () => {
    await t.close();
  });

  async function list(query = "", cookie = a.cookie) {
    const res = await getWith(t.app, `${STOCK}${query}`, cookie);
    expect(res.status).toBe(200);
    return stockPage.parse(await res.json());
  }
  const ids = async (query = "") => (await list(query)).items.map((e) => e.id).sort();
  const expectIds = (entries: StockEntry[]) => entries.map((e) => e.id).sort();

  it("lists all own entries newest first; B sees none of them", async () => {
    const page = await list("?limit=50");
    expect(page.items.map((e) => e.id)).toEqual([...created].reverse().map((e) => e.id));
    expect(page.nextCursor).toBeNull();
    expect((await list("", b.cookie)).items).toEqual([]);
  });

  it("S1: accountId filter", async () => {
    expect(await ids(`?accountId=${mainId}`)).toEqual(expectIds(created.slice(0, 2)));
  });

  it("characterId and locationId filters", async () => {
    expect(await ids(`?characterId=${darkLordId}`)).toEqual(expectIds([created[2]!]));
    expect(await ids(`?locationId=${vault1}`)).toEqual(expectIds(created.slice(0, 2)));
  });

  it("S3: groupId filter (memberships inserted directly)", async () => {
    const g = await insertGroup(t.database.pool, a.id, "Trade", [created[0]!.id, created[4]!.id]);
    expect(await ids(`?groupId=${g}`)).toEqual(expectIds([created[0]!, created[4]!]));
  });

  it("category filter", async () => {
    expect(await ids("?category=swords")).toEqual(expectIds([created[1]!, created[4]!]));
  });

  it("S2: q fuzzy 'storm' (and typo 'strom') matches Wings of Storm entries", async () => {
    const storms = expectIds([created[0]!, created[2]!]);
    expect(await ids("?q=storm")).toEqual(storms);
    expect(await ids("?q=strom")).toEqual(storms);
  });

  it("S4: no matches is an empty list, not an error", async () => {
    const page = await list(`?accountId=${mainId}&category=swords&q=storm`);
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("keyset cursor pages are stable and complete", async () => {
    const first = await list("?limit=2");
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    // A new entry created between pages must not shift later pages.
    const late = await createEntry(t.app, a.cookie, {
      catalogItemId: storm,
      storageLocationId: vault1,
    });
    const seen = [...first.items];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await list(`?limit=2&cursor=${encodeURIComponent(cursor)}`);
      seen.push(...page.items);
      cursor = page.nextCursor;
    }
    expect(seen.map((e) => e.id)).toEqual([...created].reverse().map((e) => e.id));
    expect(seen.some((e) => e.id === late.id)).toBe(false);
    await sendJson(t.app, "DELETE", `${STOCK}/${late.id}`, undefined, a.cookie);
  });

  it("a malformed cursor is 422", async () => {
    expect((await getWith(t.app, `${STOCK}?cursor=garbage`, a.cookie)).status).toBe(422);
  });

  it("rows carry item, location, unit price used and value (null when unpriced)", async () => {
    const page = await list("?limit=50");
    const byId = new Map(page.items.map((e) => [e.id, e]));
    expect(byId.get(created[0]!.id)).toMatchObject({
      itemName: "Wings of Storm",
      itemActive: true,
      categorySlug: "wings",
      imageKey: null,
      quantity: 2,
      level: 0,
      locationLabel: "Vault 1",
      gameAccountId: mainId,
      priceMc: null,
      unitPriceMc: "100.00",
      valueMc: "200.00",
    });
    expect(byId.get(created[1]!.id)).toMatchObject({ unitPriceMc: null, valueMc: null });
    expect(byId.get(created[2]!.id)?.locationLabel).toBe("Inventory – DarkLord");
  });

  it("R-CAT-3 S3 + R-CAT-2 S1: deactivated/renamed items show up flagged and renamed", async () => {
    const res = await sendJson(
      t.app,
      "PATCH",
      `/api/v1/admin/catalog/items/${inactiveLater}`,
      { isActive: false, name: "Wings of Heaven II" },
      admin.cookie,
    );
    expect(res.status).toBe(200);
    const row = (await list("?limit=50")).items.find((e) => e.id === created[3]!.id);
    expect(row).toMatchObject({
      itemName: "Wings of Heaven II",
      itemActive: false,
      valueMc: "15.00",
    });
  });

  it("filters by another user's account return nothing (no leak)", async () => {
    expect((await list(`?accountId=${mainId}`, b.cookie)).items).toEqual([]);
  });
});
