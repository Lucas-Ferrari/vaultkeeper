import { describe, expect, it } from "vitest";
import { CSV_IMPORT_LIMIT } from "../constants";
import { CSV_COLUMN, csvCatalogRow, csvHeaderIssues, csvImportQuery, csvImportResult } from "./csv";

describe("csvHeaderIssues (design 11: required category,name; optional price/active/key)", () => {
  it("accepts the required columns alone and all columns in any order", () => {
    expect(csvHeaderIssues(["category", "name"])).toEqual([]);
    expect(
      csvHeaderIssues(["external_key", "is_active", "name", "reference_price_mc", "category"]),
    ).toEqual([]);
  });

  it("ignores case and surrounding spaces in header names", () => {
    expect(csvHeaderIssues([" Category ", "NAME"])).toEqual([]);
  });

  it("reports every missing required column", () => {
    const issues = csvHeaderIssues(["reference_price_mc"]);
    expect(issues).toHaveLength(2);
    expect(issues.join(" ")).toMatch(/category/);
    expect(issues.join(" ")).toMatch(/name/);
  });

  it("reports unknown and duplicated columns", () => {
    expect(csvHeaderIssues(["category", "name", "price"]).join(" ")).toMatch(/unknown.*price/i);
    expect(csvHeaderIssues(["category", "name", "Name"]).join(" ")).toMatch(/duplicate.*name/i);
  });

  it("reports an empty header", () => {
    expect(csvHeaderIssues([])).not.toEqual([]);
  });
});

describe("csvCatalogRow (R-CAT-5)", () => {
  const base = { [CSV_COLUMN.CATEGORY]: "wings", [CSV_COLUMN.NAME]: "Wings of Storm" };

  it("maps the required columns; absent optional columns are not provided", () => {
    expect(csvCatalogRow.parse(base)).toEqual({ categorySlug: "wings", name: "Wings of Storm" });
  });

  it("EMPTY optional cells mean 'not provided' (keys omitted, so updates leave values alone)", () => {
    const row = csvCatalogRow.parse({
      ...base,
      reference_price_mc: "",
      is_active: "",
      external_key: "",
    });
    expect(row).toEqual({ categorySlug: "wings", name: "Wings of Storm" });
    expect(Object.keys(row)).not.toContain("referencePriceMc");
    expect(Object.keys(row)).not.toContain("isActive");
  });

  it("maps every provided column", () => {
    expect(
      csvCatalogRow.parse({
        ...base,
        reference_price_mc: "1500.5",
        is_active: "false",
        external_key: "openmu:s6:12:5",
      }),
    ).toEqual({
      categorySlug: "wings",
      name: "Wings of Storm",
      referencePriceMc: "1500.5",
      isActive: false,
      externalKey: "openmu:s6:12:5",
    });
  });

  it("keeps accents in names (S5) and trims them", () => {
    expect(csvCatalogRow.parse({ ...base, name: "  Espada Ígnea " }).name).toBe("Espada Ígnea");
  });

  it.each(["true", "false", "yes", "no", "1", "0", "TRUE"])("is_active %j is a boolean", (v) => {
    expect(typeof csvCatalogRow.parse({ ...base, is_active: v }).isActive).toBe("boolean");
  });

  it.each([
    ["category", { ...base, category: "" }],
    ["category", { ...base, category: "Wings!" }],
    ["name", { ...base, name: "" }],
    ["name", { ...base, name: "a".repeat(121) }],
    ["reference_price_mc", { ...base, reference_price_mc: "-1" }],
    ["reference_price_mc", { ...base, reference_price_mc: "1,5" }],
    ["reference_price_mc", { ...base, reference_price_mc: "abc" }],
    ["is_active", { ...base, is_active: "maybe" }],
    ["external_key", { ...base, external_key: "k".repeat(201) }],
  ])("rejects a bad %s, reporting the CSV column name", (column, input) => {
    const result = csvCatalogRow.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([column]);
  });
});

describe("csvImportQuery", () => {
  it("dryRun defaults to true (preview first) and parses 'false'", () => {
    expect(csvImportQuery.parse({})).toEqual({ dryRun: true });
    expect(csvImportQuery.parse({ dryRun: "false" })).toEqual({ dryRun: false });
    expect(csvImportQuery.safeParse({ dryRun: "nope" }).success).toBe(false);
  });
});

describe("csvImportResult", () => {
  it("describes counts, per-row plan and per-row errors", () => {
    const result = {
      dryRun: true,
      created: 1,
      updated: 1,
      unchanged: 0,
      rows: [
        { row: 2, action: "create", categorySlug: "wings", name: "A", itemId: null, changes: [] },
        {
          row: 3,
          action: "update",
          categorySlug: "wings",
          name: "B",
          itemId: "6f1c2c9e-3f7a-4a51-9b51-2b1f1d2b9c11",
          changes: ["reference_price_mc"],
        },
      ],
      errors: [{ row: 4, issues: [{ column: "category", message: "Unknown category" }] }],
    };
    expect(csvImportResult.parse(result)).toEqual(result);
  });
});

describe("CSV_IMPORT_LIMIT", () => {
  it("caps a file at 5000 data rows", () => {
    expect(CSV_IMPORT_LIMIT.MAX_ROWS).toBe(5000);
  });
});
