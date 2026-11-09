import { CSV_IMPORT_LIMIT } from "@vaultkeeper/shared/constants";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/http/errors";
import type { ValidationFailureDetails } from "../../shared/http/validator";
import { parseCatalogCsv } from "./parse";

const encode = (text: string) => new TextEncoder().encode(text);

function fileError(run: () => unknown): ValidationFailureDetails {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).details as ValidationFailureDetails;
  }
  throw new Error("expected a file-level ValidationError");
}

describe("parseCatalogCsv (task 3.16, design 11)", () => {
  it("parses rows with their file line numbers (header = line 1)", () => {
    const result = parseCatalogCsv(
      encode("category,name,reference_price_mc\nwings,Wings of Storm,1500\nswords,Kris,\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { row: 2, data: { categorySlug: "wings", name: "Wings of Storm", referencePriceMc: "1500" } },
      { row: 3, data: { categorySlug: "swords", name: "Kris" } },
    ]);
  });

  it("strips a UTF-8 BOM, trims cells, skips blank lines, keeps accents and quoted commas", () => {
    const result = parseCatalogCsv(
      encode('﻿Category , Name\n\n  swords ,  Espada Ígnea  \nwings,"Wings, of Storm"\r\n'),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.data)).toEqual([
      { categorySlug: "swords", name: "Espada Ígnea" },
      { categorySlug: "wings", name: "Wings, of Storm" },
    ]);
    expect(result.rows.map((r) => r.row)).toEqual([3, 4]);
  });

  it("collects per-row issues by column instead of failing the file", () => {
    const result = parseCatalogCsv(
      encode("category,name,is_active,reference_price_mc\nwings,,maybe,-1\nwings,Ok,true,1\n"),
    );
    expect(result.rows.map((r) => r.row)).toEqual([3]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.row).toBe(2);
    expect(result.errors[0]?.issues.map((i) => i.column).sort()).toEqual([
      "is_active",
      "name",
      "reference_price_mc",
    ]);
  });

  it("a row with the wrong number of cells is a row error", () => {
    const result = parseCatalogCsv(encode("category,name\nwings,A,extra\nwings\nwings,B\n"));
    expect(result.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(result.rows.map((r) => r.row)).toEqual([4]);
  });

  it("a header-only file has no rows", () => {
    expect(parseCatalogCsv(encode("category,name\n"))).toEqual({ rows: [], errors: [] });
  });

  it.each([
    ["missing required column", "category,price\nwings,1\n", /name/],
    ["unknown column", "category,name,colour\nwings,A,red\n", /colour/],
    ["empty file", "", /header/i],
  ])("%s -> file-level 422 naming the problem", (_label, text, pattern) => {
    const details = fileError(() => parseCatalogCsv(encode(text)));
    expect(details.target).toBe("form");
    expect(details.issues.map((i) => i.message).join(" ")).toMatch(pattern);
  });

  it("rejects bytes that are not UTF-8", () => {
    const latin1 = new Uint8Array([...encode("category,name\nswords,Espada "), 0xcd, 0x67]);
    const details = fileError(() => parseCatalogCsv(latin1));
    expect(details.issues[0]?.message).toMatch(/UTF-8/);
  });

  it("rejects malformed CSV (unclosed quote)", () => {
    const details = fileError(() => parseCatalogCsv(encode('category,name\nwings,"Wings\n')));
    expect(details.issues[0]?.message).toMatch(/CSV/);
  });

  it(`accepts ${CSV_IMPORT_LIMIT.MAX_ROWS} rows and rejects one more`, () => {
    const body = (n: number) =>
      `category,name\n${Array.from({ length: n }, (_, i) => `wings,Item ${i}`).join("\n")}\n`;
    expect(parseCatalogCsv(encode(body(CSV_IMPORT_LIMIT.MAX_ROWS))).rows).toHaveLength(
      CSV_IMPORT_LIMIT.MAX_ROWS,
    );
    const details = fileError(() => parseCatalogCsv(encode(body(CSV_IMPORT_LIMIT.MAX_ROWS + 1))));
    expect(details.issues[0]?.message).toMatch(String(CSV_IMPORT_LIMIT.MAX_ROWS));
  });
});
