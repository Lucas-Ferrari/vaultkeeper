import { stockGroupDetail } from "@vaultkeeper/shared/schemas/groups";
import { valuationSummary, valuationTotals } from "@vaultkeeper/shared/schemas/valuation";
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
  createAccount,
  createEntry,
  insertGroup,
  locationId,
} from "../../../test/storage-fixtures";

const GROUPS = "/api/v1/groups";

describe("group view + valuation (task 5.5, R-GRP-3, R-VAL-3)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let e500: string;
  let eUnpriced: string;
  let g1: string;
  let g2: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    const [priced = "", unpriced = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm", referencePriceMc: "250" },
      { categorySlug: "wings", name: "Wings of Nothing" },
    ]);
    const main = await createAccount(t.app, a.cookie, "Main");
    const vault1 = await locationId(t.app, a.cookie, main.id, "Vault 1");
    e500 = (
      await createEntry(t.app, a.cookie, {
        catalogItemId: priced,
        storageLocationId: vault1,
        quantity: 2,
      })
    ).id;
    eUnpriced = (
      await createEntry(t.app, a.cookie, { catalogItemId: unpriced, storageLocationId: vault1 })
    ).id;
    g1 = await insertGroup(t.database.pool, a.id, "G1", [e500, eUnpriced]);
    g2 = await insertGroup(t.database.pool, a.id, "G2", [e500]);
  });
  afterAll(async () => {
    await t.close();
  });

  const totalsOf = async (groupId: string, cookie = a.cookie) => {
    const res = await getWith(t.app, `/api/v1/valuation/groups/${groupId}`, cookie);
    return {
      status: res.status,
      body: res.status === 200 ? valuationTotals.parse(await res.json()) : null,
    };
  };

  it("R-GRP-3 S1: 500 MC + 1 unpriced -> 500 MC, 3750 MP, partial; detail lists members", async () => {
    expect((await totalsOf(g1)).body).toEqual({
      totalMc: "500.00",
      totalMp: "3750.00",
      pricedCount: 1,
      unpricedCount: 1,
      partial: true,
    });
    const detail = stockGroupDetail.parse(
      await (await getWith(t.app, `${GROUPS}/${g1}`, a.cookie)).json(),
    );
    expect(detail.totals).toMatchObject({ totalMc: "500.00", partial: true });
    expect(
      detail.entries.map((e) => [e.itemName, e.quantity, e.valueMc, e.locationLabel]).sort(),
    ).toEqual([
      ["Wings of Nothing", 1, null, "Vault 1"],
      ["Wings of Storm", 2, "500.00", "Vault 1"],
    ]);
  });

  it("R-VAL-3 S3: E(500) in G1 and G2 counts in both; S2: overall counts it once", async () => {
    expect((await totalsOf(g2)).body?.totalMc).toBe("500.00");
    const summary = valuationSummary.parse(
      await (await getWith(t.app, "/api/v1/valuation/summary", a.cookie)).json(),
    );
    expect(summary.totals).toMatchObject({ totalMc: "500.00", pricedCount: 1, unpricedCount: 1 });
  });

  it("group valuation of B's or an unknown group is 404", async () => {
    expect((await totalsOf(g1, b.cookie)).status).toBe(404);
    expect((await totalsOf(crypto.randomUUID())).status).toBe(404);
  });

  it("R-STK-3 S1: deleting E drops group totals, groups stay", async () => {
    expect((await sendJson(t.app, "DELETE", `${STOCK}/${e500}`, undefined, a.cookie)).status).toBe(
      204,
    );
    expect((await totalsOf(g1)).body).toMatchObject({
      totalMc: "0.00",
      pricedCount: 0,
      unpricedCount: 1,
    });
    expect((await totalsOf(g2)).body).toMatchObject({
      totalMc: "0.00",
      pricedCount: 0,
      partial: false,
    });
  });
});
