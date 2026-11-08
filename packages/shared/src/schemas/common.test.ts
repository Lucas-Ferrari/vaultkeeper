import { describe, expect, it } from "vitest";
import { itemLevel, mcAmount } from "./common";

describe("mcAmount (exact decimal MC on the wire, R-CAT-1 S4/S5, ADR3)", () => {
  it.each(["0", "1500.5", "999999999999.99", "100.00", "7"])("accepts %s", (value) => {
    expect(mcAmount.parse(value)).toBe(value);
  });

  it.each(["-1", "1.234", "abc", "1e3", "", " 1", "1.", ".5", "1000000000000", "1,5", "0x10"])(
    "rejects %j",
    (value) => {
      expect(mcAmount.safeParse(value).success).toBe(false);
    },
  );

  it("rejects numbers: amounts travel as strings so JS floats never touch them", () => {
    expect(mcAmount.safeParse(1500.5).success).toBe(false);
  });
});

describe("itemLevel (+0..+15, R-STK-1 S3)", () => {
  it.each([0, 7, 15])("accepts %d", (value) => {
    expect(itemLevel.parse(value)).toBe(value);
  });

  it.each([-1, 16, 1.5, Number.NaN, "3"])("rejects %j", (value) => {
    expect(itemLevel.safeParse(value).success).toBe(false);
  });
});
