import { describe, expect, it } from "vitest";
import {
  CATALOG_SOURCE,
  CATEGORY_SLUG_PATTERN,
  CSV_MAX_BYTES,
  ERROR_CODE,
  IMAGE_MIME,
  isErrorCode,
  LEVEL,
  MC_TO_MP_RATE_DEFAULT,
  QUANTITY,
  ROLE,
  STORAGE_KIND,
  TEXT_LIMIT,
  UPLOAD_MAX_BYTES,
  VAULT_COUNT,
} from "./index";

describe("shared constants (smoke)", () => {
  it("exposes the contract values from design 21", () => {
    expect(STORAGE_KIND).toEqual({ INVENTORY: "inventory", VAULT: "vault" });
    expect(ROLE).toEqual({ USER: "user", ADMIN: "admin" });
    expect(Object.values(IMAGE_MIME)).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(UPLOAD_MAX_BYTES).toBe(1_048_576);
    expect(CSV_MAX_BYTES).toBe(2_097_152);
    expect(LEVEL).toEqual({ MIN: 0, MAX: 15 });
  });

  it("exposes the limits the DB schema mirrors (spec lengths win, tasks index)", () => {
    expect(CATALOG_SOURCE).toEqual({ OPENMU: "openmu", ADMIN: "admin", CSV: "csv" });
    expect(TEXT_LIMIT).toEqual({
      CATALOG_ITEM_NAME: 120,
      GAME_ACCOUNT_NAME: 50,
      CHARACTER_NAME: 30,
      GROUP_NAME: 60,
      GROUP_DESCRIPTION: 500,
      ENTRY_OPTIONS: 500,
      ENTRY_NOTES: 500,
      GAME_ACCOUNT_NOTES: 500,
      CHARACTER_CLASS: 30,
    });
    expect(QUANTITY).toEqual({ MIN: 1, MAX: 9999 });
    expect(VAULT_COUNT).toEqual({ MIN: 1, MAX: 50, DEFAULT: 10 });
    expect(MC_TO_MP_RATE_DEFAULT).toBe("7.5");
    expect(CATEGORY_SLUG_PATTERN.test("wings-1")).toBe(true);
    expect(CATEGORY_SLUG_PATTERN.test("Bad Slug")).toBe(false);
  });

  it("keys every ERROR_CODE by its own value", () => {
    for (const [key, value] of Object.entries(ERROR_CODE)) {
      expect(value).toBe(key);
    }
    expect(Object.keys(ERROR_CODE)).toHaveLength(12);
  });

  it("narrows unknown values with isErrorCode", () => {
    expect(isErrorCode("NOT_FOUND")).toBe(true);
    expect(isErrorCode("NOPE")).toBe(false);
    expect(isErrorCode(404)).toBe(false);
  });
});
