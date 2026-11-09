import { CATALOG_SOURCE, CSV_IMPORT_LIMIT, CSV_MAX_BYTES } from "@vaultkeeper/shared/constants";
import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import {
  CSV_ROW_ACTION,
  csvImportErrorDetails,
  csvImportResult,
  type CsvImportResult,
  type CsvRowError,
} from "@vaultkeeper/shared/schemas/csv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  signUp,
  signUpAdmin,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { insertCategories, insertItems } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";
import { TEST_PUBLIC_URL } from "../../../test/factories";

const IMPORT = "/api/v1/admin/catalog/import";

interface ItemState {
  id: string;
  category_slug: string;
  name: string;
  reference_price_mc: string | null;
  is_active: boolean;
  external_key: string | null;
  source: string;
}

describe("admin catalog CSV import (task 3.17, R-CAT-5, design 11)", () => {
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

  function post(
    csv: string | Uint8Array,
    query = "?dryRun=false",
    cookie = admin.cookie,
    app = t.app,
  ): Promise<Response> {
    const form = new FormData();
    form.append("file", new File([csv], "catalog.csv", { type: "text/csv" }));
    return Promise.resolve(
      app.request(`${TEST_PUBLIC_URL}${IMPORT}${query}`, {
        method: "POST",
        headers: { origin: TEST_PUBLIC_URL, cookie },
        body: form,
      }),
    );
  }

  async function importOk(csv: string, query = "?dryRun=false"): Promise<CsvImportResult> {
    const res = await post(csv, query);
    expect(res.status, await res.clone().text()).toBe(200);
    return csvImportResult.parse(await res.json());
  }

  async function rowErrors(res: Response): Promise<CsvRowError[]> {
    expect(res.status, await res.clone().text()).toBe(422);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
    return csvImportErrorDetails.parse(body.error.details).errors;
  }

  async function item(category: string, name: string): Promise<ItemState | undefined> {
    const { rows } = await t.database.pool.query<ItemState>(
      `SELECT id, category_slug, name, reference_price_mc, is_active, external_key, source
       FROM catalog_items WHERE category_slug = $1 AND name = $2`,
      [category, name],
    );
    return rows[0];
  }

  async function itemCount(): Promise<number> {
    const { rows } = await t.database.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM catalog_items",
    );
    return Number(rows[0]?.n);
  }

  it("S1: 3 valid new rows -> 3 created (source csv, defaults for empty cells)", async () => {
    const result = await importOk(
      [
        "category,name,reference_price_mc,is_active",
        "wings,S1 Wings of Storm,1500,",
        "wings,S1 Wings of Eternal,,false",
        "swords,S1 Kris,,",
      ].join("\n"),
    );
    expect(result).toMatchObject({ dryRun: false, created: 3, updated: 0, unchanged: 0 });
    expect(result.errors).toEqual([]);
    expect(await item("wings", "S1 Wings of Storm")).toMatchObject({
      reference_price_mc: "1500.00",
      is_active: true,
      source: CATALOG_SOURCE.CSV,
    });
    expect(await item("wings", "S1 Wings of Eternal")).toMatchObject({
      reference_price_mc: null,
      is_active: false,
    });
    expect(await item("swords", "S1 Kris")).toMatchObject({ reference_price_mc: null });
  });

  it("S2: a row matching an existing item (case-insensitive) with a new price -> updated", async () => {
    await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "S2 Wings of Heaven", referencePriceMc: "100" },
    ]);
    const result = await importOk("category,name,reference_price_mc\nwings,s2 WINGS OF heaven,250");
    expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 0 });
    expect(result.rows[0]).toMatchObject({
      row: 2,
      action: CSV_ROW_ACTION.UPDATE,
      name: "S2 Wings of Heaven",
      changes: ["reference_price_mc"],
    });
    expect(await item("wings", "S2 Wings of Heaven")).toMatchObject({
      reference_price_mc: "250.00",
      source: CATALOG_SOURCE.ADMIN,
    });
  });

  it("same values (1500 vs 1500.00) -> unchanged, nothing written", async () => {
    await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Same Wings", referencePriceMc: "1500" },
    ]);
    const result = await importOk(
      "category,name,reference_price_mc,is_active\nwings,Same Wings,1500.0,true",
    );
    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(result.rows[0]?.action).toBe(CSV_ROW_ACTION.UNCHANGED);
  });

  it("empty optional cells leave existing values unchanged", async () => {
    await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Kept Wings", referencePriceMc: "77", isActive: false },
    ]);
    const result = await importOk("category,name,reference_price_mc,is_active\nwings,Kept Wings,,");
    expect(result).toMatchObject({ updated: 0, unchanged: 1 });
    expect(await item("wings", "Kept Wings")).toMatchObject({
      reference_price_mc: "77.00",
      is_active: false,
    });
  });

  it("is_active can deactivate an existing item", async () => {
    await insertItems(t.database.pool, [{ categorySlug: "wings", name: "Retired Wings" }]);
    const result = await importOk("category,name,is_active\nwings,Retired Wings,no");
    expect(result.rows[0]).toMatchObject({ action: "update", changes: ["is_active"] });
    expect((await item("wings", "Retired Wings"))?.is_active).toBe(false);
  });

  it("S3: one unknown category -> 422 listing the row number + reason AND no row applied", async () => {
    const before = await itemCount();
    const errors = await rowErrors(
      await post("category,name\nwings,S3 Fresh Wings\npets,S3 Fenrir\nswords,S3 Fresh Sword"),
    );
    expect(errors).toEqual([
      { row: 3, issues: [{ column: "category", message: expect.stringMatching(/unknown/i) }] },
    ]);
    expect(await itemCount()).toBe(before);
    expect(await item("wings", "S3 Fresh Wings")).toBeUndefined();
  });

  it("invalid cells are row errors too (all-or-nothing)", async () => {
    const before = await itemCount();
    const errors = await rowErrors(
      await post("category,name,reference_price_mc\nwings,Bad Price Wings,-5\nwings,Fine Wings,1"),
    );
    expect(errors.map((e) => [e.row, e.issues[0]?.column])).toEqual([[2, "reference_price_mc"]]);
    expect(await itemCount()).toBe(before);
  });

  it("S4: two rows with the same key (case/accents differ) -> duplicate row rejected", async () => {
    const before = await itemCount();
    const errors = await rowErrors(
      await post("category,name\nswords,Lâmina Dupla\nswords,lamina DUPLA\nwings,Other Dup"),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.row).toBe(3);
    expect(errors[0]?.issues[0]?.message).toMatch(/duplicate.*row 2/i);
    expect(await itemCount()).toBe(before);
  });

  it("the same name in different categories is not a duplicate", async () => {
    const result = await importOk("category,name\nswords,Twin Name\nwings,Twin Name");
    expect(result.created).toBe(2);
  });

  it("S5: accented names are stored with accents; an unaccented row matches and keeps them", async () => {
    expect((await importOk("category,name\nswords,Espada Ígnea")).created).toBe(1);
    expect((await item("swords", "Espada Ígnea"))?.name).toBe("Espada Ígnea");

    const result = await importOk("category,name,reference_price_mc\nswords,Espada Ignea,999");
    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(result.rows[0]?.name).toBe("Espada Ígnea");
    expect(await item("swords", "Espada Ígnea")).toMatchObject({ reference_price_mc: "999.00" });
    expect(await item("swords", "Espada Ignea")).toBeUndefined();
  });

  describe("external_key", () => {
    it("is stored on create and must agree with the matched item", async () => {
      await importOk("category,name,external_key\nwings,Keyed Wings,ext:1");
      expect((await item("wings", "Keyed Wings"))?.external_key).toBe("ext:1");
      expect(
        (await importOk("category,name,external_key\nwings,Keyed Wings,ext:1")).unchanged,
      ).toBe(1);
      const errors = await rowErrors(
        await post("category,name,external_key\nwings,Keyed Wings,ext:other"),
      );
      expect(errors[0]?.issues[0]).toMatchObject({ column: "external_key" });
    });

    it("sets the key of a matched item that has none", async () => {
      await insertItems(t.database.pool, [{ categorySlug: "wings", name: "Keyless Wings" }]);
      const result = await importOk("category,name,external_key\nwings,Keyless Wings,ext:2");
      expect(result.rows[0]).toMatchObject({ action: "update", changes: ["external_key"] });
      expect((await item("wings", "Keyless Wings"))?.external_key).toBe("ext:2");
    });

    it("rejects a key already used by another item, and duplicate keys in the file", async () => {
      await importOk("category,name,external_key\nwings,Owner Wings,ext:3");
      const taken = await rowErrors(
        await post("category,name,external_key\nwings,Thief Wings,ext:3"),
      );
      expect(taken[0]?.issues[0]?.message).toMatch(/another item/i);
      const dup = await rowErrors(
        await post("category,name,external_key\nwings,Dup A,ext:4\nwings,Dup B,ext:4"),
      );
      expect(dup.map((e) => e.row)).toEqual([3]);
    });
  });

  describe("dryRun", () => {
    it("returns the diff (created/updated/unchanged per row) and writes nothing", async () => {
      await insertItems(t.database.pool, [
        { categorySlug: "wings", name: "Dry Update", referencePriceMc: "1" },
        { categorySlug: "wings", name: "Dry Same", referencePriceMc: "2" },
      ]);
      const before = await itemCount();
      const result = await importOk(
        "category,name,reference_price_mc\nwings,Dry New,5\nwings,Dry Update,9\nwings,Dry Same,2",
        "?dryRun=true",
      );
      expect(result).toMatchObject({ dryRun: true, created: 1, updated: 1, unchanged: 1 });
      expect(result.rows.map((r) => [r.row, r.action])).toEqual([
        [2, "create"],
        [3, "update"],
        [4, "unchanged"],
      ]);
      expect(result.rows[1]?.itemId).toBe((await item("wings", "Dry Update"))?.id);
      expect(await itemCount()).toBe(before);
      expect((await item("wings", "Dry Update"))?.reference_price_mc).toBe("1.00");
    });

    it("is the default when dryRun is omitted", async () => {
      const before = await itemCount();
      expect((await importOk("category,name\nwings,Default Dry", "")).dryRun).toBe(true);
      expect(await itemCount()).toBe(before);
    });

    it("reports row errors with 200 so the preview can show them", async () => {
      const result = await importOk("category,name\npets,Nope\nwings,Dry Fine", "?dryRun=true");
      expect(result.errors.map((e) => e.row)).toEqual([2]);
      expect(result.rows.map((r) => r.row)).toEqual([3]);
    });
  });

  describe("S6: file-level rejections", () => {
    it("wrong headers -> 422, also on dryRun", async () => {
      for (const query of ["?dryRun=true", "?dryRun=false"]) {
        const res = await post("categoria,nombre\nwings,X", query);
        expect(res.status).toBe(422);
        expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.VALIDATION_FAILED);
      }
    });

    it(`more than ${CSV_IMPORT_LIMIT.MAX_ROWS} rows -> 422`, async () => {
      const rows = Array.from({ length: CSV_IMPORT_LIMIT.MAX_ROWS + 1 }, (_, i) => `wings,R${i}`);
      const res = await post(`category,name\n${rows.join("\n")}`);
      expect(res.status).toBe(422);
    });

    it("a file over CSV_MAX_BYTES -> 413, nothing applied", async () => {
      const before = await itemCount();
      const header = "category,name\nwings,Too Big\n";
      const csv = header + "#".repeat(CSV_MAX_BYTES + 1 - header.length);
      const res = await post(csv);
      expect(res.status).toBe(413);
      expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.PAYLOAD_TOO_LARGE);
      expect(await itemCount()).toBe(before);
    });

    it("a body over the route limit (3 MB) -> 413", async () => {
      const res = await post(`category,name\n${"x".repeat(3 * 1024 * 1024)}`);
      expect(res.status).toBe(413);
    });

    it("no `file` field -> 422", async () => {
      const form = new FormData();
      form.append("csv", new File(["category,name"], "a.csv"));
      const res = await t.app.request(`${TEST_PUBLIC_URL}${IMPORT}`, {
        method: "POST",
        headers: { origin: TEST_PUBLIC_URL, cookie: admin.cookie },
        body: form,
      });
      expect(res.status).toBe(422);
    });

    it("CSV_MAX_BYTES comes from the environment", async () => {
      const small = createTestApp(db.current.url, { env: { CSV_MAX_BYTES: "64" } });
      try {
        const ok = await post(
          "category,name\nwings,Env Small",
          "?dryRun=true",
          admin.cookie,
          small.app,
        );
        expect(ok.status).toBe(200);
        const big = await post(
          `category,name\nwings,${"E".repeat(64)}`,
          "",
          admin.cookie,
          small.app,
        );
        expect(big.status).toBe(413);
        const huge = await post(
          `category,name\n${"x".repeat(64 * 1024)}`,
          "",
          admin.cookie,
          small.app,
        );
        expect(huge.status).toBe(413);
        expect(((await huge.json()) as ApiErrorBody).error.message).toMatch(/Request body/);
      } finally {
        await small.close();
      }
    });
  });

  it("R-AUTH-4: a plain user gets 403 and nothing is applied", async () => {
    const before = await itemCount();
    const res = await post("category,name\nwings,User Wings", "?dryRun=false", member.cookie);
    expect(res.status).toBe(403);
    expect(await itemCount()).toBe(before);
  });
});
