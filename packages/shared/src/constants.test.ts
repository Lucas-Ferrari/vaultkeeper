import { describe, expect, it } from "vitest";
import {
  CSV_MAX_BYTES,
  ERROR_CODE,
  IMAGE_MIME,
  isErrorCode,
  LEVEL,
  ROLE,
  STORAGE_KIND,
  UPLOAD_MAX_BYTES,
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
