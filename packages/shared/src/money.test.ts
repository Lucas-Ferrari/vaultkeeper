import { describe, expect, it } from "vitest";
import { mul, sum, toMp } from "./money";

describe("money (BigInt cents, client previews only; R-VAL-1, R-VAL-2, ADR3)", () => {
  describe("mul(amount, quantity)", () => {
    it.each([
      ["100.00", 3, "300.00"],
      ["0", 2, "0.00"],
      ["250", 2, "500.00"],
      ["1500.5", 1, "1500.50"],
      ["0.01", 9999, "99.99"],
      // beyond Number.MAX_SAFE_INTEGER cents: exact only because of BigInt
      ["999999999999.99", 9999, "9998999999999900.01"],
    ])("%s x %d = %s", (amount, quantity, expected) => {
      expect(mul(amount, quantity)).toBe(expected);
    });

    it("rejects non-integer or negative quantities", () => {
      expect(() => mul("1", 1.5)).toThrow(RangeError);
      expect(() => mul("1", -1)).toThrow(RangeError);
    });

    it("rejects malformed amounts", () => {
      expect(() => mul("abc", 1)).toThrow(RangeError);
      expect(() => mul("-1", 1)).toThrow(RangeError);
      expect(() => mul("1.234", 1)).toThrow(RangeError);
    });
  });

  describe("toMp(mc, rate)", () => {
    it.each([
      ["300", "7.5", "2250.00"],
      ["300.00", "8", "2400.00"],
      ["0", "7.5", "0.00"],
      ["0.01", "0.5", "0.01"], // 0.005 rounds half up, like Postgres round(numeric)
      ["0.01", "0.3333", "0.00"],
      ["1.23", "7.5", "9.23"], // 9.225 -> 9.23
    ])("%s MC at %s = %s MP", (mc, rate, expected) => {
      expect(toMp(mc, rate)).toBe(expected);
    });

    it("rejects malformed rates", () => {
      expect(() => toMp("1", "7.55555")).toThrow(RangeError);
      expect(() => toMp("1", "x")).toThrow(RangeError);
    });
  });

  describe("sum(amounts)", () => {
    it("skips null (unpriced) entries instead of counting them as 0", () => {
      expect(sum(["300.00", null, "200"])).toBe("500.00");
    });

    it("returns 0.00 for no amounts", () => {
      expect(sum([])).toBe("0.00");
      expect(sum([null])).toBe("0.00");
    });

    it("has no float drift: 0.1 + 0.2 = 0.30", () => {
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(sum(["0.1", "0.2"])).toBe("0.30");
    });
  });
});
