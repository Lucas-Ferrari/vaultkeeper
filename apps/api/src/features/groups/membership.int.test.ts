import { stockGroupDetail, type StockGroupDetail } from "@vaultkeeper/shared/schemas/groups";
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

const GROUPS = "/api/v1/groups";

describe("group membership (task 5.4, R-GRP-2)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let item: string;
  let vault1: string;
  let vault2: string;
  let bEntry: string;
  let bGroup: string;

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
    vault2 = await locationId(t.app, a.cookie, main.id, "Vault 2");
    const bAcc = await createAccount(t.app, b.cookie, "Main");
    bEntry = (
      await createEntry(t.app, b.cookie, {
        catalogItemId: item,
        storageLocationId: await locationId(t.app, b.cookie, bAcc.id, "Vault 1"),
      })
    ).id;
    bGroup = await insertGroup(t.database.pool, b.id, "B's");
  });
  afterAll(async () => {
    await t.close();
  });

  const entry = async () =>
    (await createEntry(t.app, a.cookie, { catalogItemId: item, storageLocationId: vault1 })).id;
  const group = (name: string) => insertGroup(t.database.pool, a.id, name);
  const add = (groupId: string, ids: string[], cookie = a.cookie) =>
    sendJson(t.app, "POST", `${GROUPS}/${groupId}/entries`, { stockEntryIds: ids }, cookie);
  const members = (groupId: string) =>
    countRows(t.database.pool, "stock_group_entries WHERE group_id = $1", [groupId]);
  async function detail(groupId: string): Promise<StockGroupDetail> {
    const res = await getWith(t.app, `${GROUPS}/${groupId}`, a.cookie);
    expect(res.status).toBe(200);
    return stockGroupDetail.parse(await res.json());
  }

  it("S1: adding E1, E2 lists both with their current location", async () => {
    const [e1, e2, g] = [await entry(), await entry(), await group("S1")];
    const res = await add(g, [e1, e2]);
    expect(res.status).toBe(200);
    const body = stockGroupDetail.parse(await res.json());
    expect(body.entries.map((e) => e.id).sort()).toEqual([e1, e2].sort());
    expect(body.entries.every((e) => e.locationLabel === "Vault 1")).toBe(true);
    expect(body.entryCount).toBe(2);
  });

  it("S2: re-adding is idempotent; S3: an entry may be in several groups", async () => {
    const [e1, g, g2] = [await entry(), await group("S2"), await group("S3")];
    expect((await add(g, [e1])).status).toBe(200);
    expect((await add(g, [e1, e1])).status).toBe(200);
    expect(await members(g)).toBe(1);
    expect((await add(g2, [e1])).status).toBe(200);
    expect(
      await countRows(t.database.pool, "stock_group_entries WHERE stock_entry_id = $1", [e1]),
    ).toBe(2);
  });

  it("S4: removing keeps the entry and its other group; S5: a move keeps memberships", async () => {
    const [e1, g, g2] = [await entry(), await group("S4a"), await group("S4b")];
    await add(g, [e1]);
    await add(g2, [e1]);
    const res = await sendJson(
      t.app,
      "DELETE",
      `${GROUPS}/${g}/entries/${e1}`,
      undefined,
      a.cookie,
    );
    expect(res.status).toBe(204);
    expect(await members(g)).toBe(0);
    expect(await members(g2)).toBe(1);
    expect(await countRows(t.database.pool, "stock_entries WHERE id = $1", [e1])).toBe(1);
    await sendJson(t.app, "POST", `${STOCK}/${e1}/move`, { storageLocationId: vault2 }, a.cookie);
    expect((await detail(g2)).entries[0]?.locationLabel).toBe("Vault 2");
  });

  it("S6: B's entry into A's group, or A's entry into B's group, is 404", async () => {
    const [e1, g] = [await entry(), await group("S6")];
    expect((await add(g, [bEntry])).status).toBe(404);
    expect((await add(bGroup, [e1])).status).toBe(404);
    expect((await add(g, [e1], b.cookie)).status).toBe(404);
    expect(
      (
        await sendJson(
          t.app,
          "DELETE",
          `${GROUPS}/${bGroup}/entries/${bEntry}`,
          undefined,
          a.cookie,
        )
      ).status,
    ).toBe(404);
    expect(await members(g)).toBe(0);
    expect(await members(bGroup)).toBe(0);
  });

  it("S7: a bulk add with one foreign or unknown id adds nothing", async () => {
    const [e1, e2, g] = [await entry(), await entry(), await group("S7")];
    expect((await add(g, [e1, e2, bEntry])).status).toBe(404);
    expect((await add(g, [e1, crypto.randomUUID()])).status).toBe(404);
    expect(await members(g)).toBe(0);
  });

  it("PUT replaces the whole set (and may empty it), all-or-nothing", async () => {
    const [e1, e2, e3, g] = [await entry(), await entry(), await entry(), await group("PUT")];
    await add(g, [e1, e2]);
    const put = (ids: string[]) =>
      sendJson(t.app, "PUT", `${GROUPS}/${g}/entries`, { stockEntryIds: ids }, a.cookie);
    const res = await put([e2, e3]);
    expect(res.status).toBe(200);
    expect(
      stockGroupDetail
        .parse(await res.json())
        .entries.map((e) => e.id)
        .sort(),
    ).toEqual([e2, e3].sort());
    expect((await put([e1, bEntry])).status).toBe(404);
    expect(await members(g)).toBe(2);
    expect((await put([])).status).toBe(200);
    expect(await members(g)).toBe(0);
  });

  it("ADR2 backstop: the DB itself rejects a cross-user membership row", async () => {
    const g = await group("ADR2");
    await expect(
      t.database.pool.query(
        "INSERT INTO stock_group_entries (group_id, stock_entry_id, user_id) VALUES ($1, $2, $3)",
        [g, bEntry, a.id],
      ),
    ).rejects.toThrow(/foreign key/);
  });
});
