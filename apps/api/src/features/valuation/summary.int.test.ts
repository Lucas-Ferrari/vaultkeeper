import { valuationSummary, type ValuationSummary } from "@vaultkeeper/shared/schemas/valuation";
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
  createAccount,
  createCharacter,
  createEntry,
  locationId,
} from "../../../test/storage-fixtures";

const SUMMARY = "/api/v1/valuation/summary";
const ZERO = { totalMc: "0.00", totalMp: "0.00", pricedCount: 0, unpricedCount: 0, partial: false };

describe("GET /valuation/summary (tasks 5.1/5.2, R-VAL-1..3)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let admin: SignedInUser;
  let priced: string;
  let unpriced: string;
  let mainId: string;
  let altId: string;
  let vault1: string;
  let vault2: string;
  let darkLordInv: string;
  let overridden: string;
  let inherited: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    admin = await signUpAdmin(t);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [priced = "", unpriced = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm", referencePriceMc: "100" },
      { categorySlug: "wings", name: "Wings of Nothing" },
    ]);
    mainId = (await createAccount(t.app, a.cookie, "Main")).id;
    altId = (await createAccount(t.app, a.cookie, "Alt")).id;
    await createCharacter(t.app, a.cookie, mainId, "DarkLord");
    vault1 = await locationId(t.app, a.cookie, mainId, "Vault 1");
    vault2 = await locationId(t.app, a.cookie, mainId, "Vault 2");
    darkLordInv = await locationId(t.app, a.cookie, mainId, "Inventory – DarkLord");
    const altVault = await locationId(t.app, a.cookie, altId, "Vault 1");
    const add = (body: Record<string, unknown>) => createEntry(t.app, a.cookie, body);
    // Vault 1: override 250 x 2 = 500 (R-VAL-1 S1) + override 0 x 5 = 0, priced (S4).
    overridden = (
      await add({ catalogItemId: priced, storageLocationId: vault1, priceMc: "250", quantity: 2 })
    ).id;
    await add({ catalogItemId: priced, storageLocationId: vault1, priceMc: "0", quantity: 5 });
    // Vault 2: inherit 100 x 3 = 300 (S2) + 1 unpriced (S3) -> partial (R-VAL-3 S1).
    inherited = (await add({ catalogItemId: priced, storageLocationId: vault2, quantity: 3 })).id;
    await add({ catalogItemId: unpriced, storageLocationId: vault2 });
    // Character inventory 100, Alt account 100.
    await add({ catalogItemId: priced, storageLocationId: darkLordInv });
    await add({ catalogItemId: priced, storageLocationId: altVault });
    // B's stock never leaks into A's totals (R-VAL-3 S5).
    const bAcc = await createAccount(t.app, b.cookie, "Main");
    await createEntry(t.app, b.cookie, {
      catalogItemId: priced,
      storageLocationId: await locationId(t.app, b.cookie, bAcc.id, "Vault 1"),
      quantity: 9,
    });
  });
  afterAll(async () => {
    await t.close();
  });

  async function summary(cookie = a.cookie, query = ""): Promise<ValuationSummary> {
    const res = await getWith(t.app, `${SUMMARY}${query}`, cookie);
    expect(res.status).toBe(200);
    return valuationSummary.parse(await res.json());
  }
  const location = (s: ValuationSummary, id: string) =>
    s.byLocation.find((l) => l.locationId === id);

  it("overall: unpriced excluded and counted, partial flag, MP = MC x 7.5 (R-VAL-1/2/3)", async () => {
    const s = await summary();
    expect(s.mcToMpRate).toBe("7.5000");
    expect(s.totals).toEqual({
      totalMc: "1000.00",
      totalMp: "7500.00",
      pricedCount: 5,
      unpricedCount: 1,
      partial: true,
    });
  });

  it("per location: override, zero price, inherit + unpriced, labeled character inventory", async () => {
    const s = await summary();
    expect(location(s, vault1)).toMatchObject({
      label: "Vault 1",
      totalMc: "500.00",
      pricedCount: 2,
      unpricedCount: 0,
      partial: false,
    });
    expect(location(s, vault2)).toMatchObject({
      totalMc: "300.00",
      totalMp: "2250.00",
      unpricedCount: 1,
      partial: true,
    });
    expect(location(s, darkLordInv)).toMatchObject({
      kind: "inventory",
      label: "Inventory – DarkLord",
      totalMc: "100.00",
    });
    // Only locations holding stock are listed.
    expect(s.byLocation).toHaveLength(4);
  });

  it("per account: every account of the user, by name", async () => {
    const s = await summary();
    expect(s.byAccount.map((x) => [x.accountName, x.totalMc, x.partial])).toEqual([
      ["Alt", "100.00", false],
      ["Main", "900.00", true],
    ]);
  });

  it("?accountId narrows totals and breakdowns; a foreign account is 404", async () => {
    const s = await summary(a.cookie, `?accountId=${altId}`);
    expect(s.totals).toMatchObject({ totalMc: "100.00", pricedCount: 1, partial: false });
    expect(s.byAccount.map((x) => x.accountId)).toEqual([altId]);
    expect(s.byLocation).toHaveLength(1);
    const foreign = await getWith(t.app, `${SUMMARY}?accountId=${mainId}`, b.cookie);
    expect(foreign.status).toBe(404);
  });

  it("S5 isolation: B only sees B's own entries", async () => {
    expect((await summary(b.cookie)).totals).toMatchObject({ totalMc: "900.00", pricedCount: 1 });
  });

  it("S4 empty user: 0 / 0 / counts 0 / partial false", async () => {
    const s = await summary(admin.cookie);
    expect(s.totals).toEqual(ZERO);
    expect(s.byAccount).toEqual([]);
    expect(s.byLocation).toEqual([]);
  });

  it("requires a session", async () => {
    expect((await getWith(t.app, SUMMARY)).status).toBe(401);
  });

  describe("live revaluation (task 5.2): SQL is the only truth, nothing is stored", () => {
    it("R-VAL-1 S5: catalog 100 -> 120 re-values inheriting entries, overrides unchanged", async () => {
      const res = await sendJson(
        t.app,
        "PATCH",
        `/api/v1/admin/catalog/items/${priced}`,
        { referencePriceMc: "120" },
        admin.cookie,
      );
      expect(res.status).toBe(200);
      const s = await summary();
      expect(location(s, vault1)?.totalMc).toBe("500.00");
      expect(location(s, vault2)?.totalMc).toBe("360.00");
      expect(s.totals.totalMc).toBe("1100.00");
      const entry = await getWith(t.app, `/api/v1/stock/${inherited}`, a.cookie);
      expect(await entry.json()).toMatchObject({ valueMc: "360.00" });
      const kept = await getWith(t.app, `/api/v1/stock/${overridden}`, a.cookie);
      expect(await kept.json()).toMatchObject({ valueMc: "500.00" });
    });

    it("R-VAL-2 S2: rate 8 changes MP on the next read; no MP column exists", async () => {
      await t.database.pool.query("UPDATE app_settings SET mc_to_mp_rate = 8");
      const s = await summary();
      expect(s.mcToMpRate).toBe("8.0000");
      expect(s.totals.totalMp).toBe("8800.00");
      const { rows } = await t.database.pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name ~ '(^|_)mp(_|$)' AND column_name <> 'mc_to_mp_rate'`,
      );
      expect(rows[0]?.n).toBe("0");
    });
  });
});
