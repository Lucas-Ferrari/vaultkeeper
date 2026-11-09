import { describe, expect, it } from "vitest";
import { formatMoney, formatTotal } from "./format-money";

describe("formatMoney", () => {
  it("groups thousands and keeps 2 decimals, without floats", () => {
    expect(formatMoney("0")).toBe("0.00");
    expect(formatMoney("2250")).toBe("2,250.00");
    // MP totals may exceed numeric(14,2)'s 12 integer digits.
    expect(formatMoney("12345678901234567.5")).toBe("12,345,678,901,234,567.50");
    expect(formatMoney("999.99")).toBe("999.99");
  });

  it("an unpriced value is '-', never 0", () => {
    expect(formatMoney(null)).toBe("-");
  });
});

describe("formatTotal (R-VAL-3)", () => {
  const base = { totalMc: "0.00", totalMp: "0.00", pricedCount: 0, unpricedCount: 0 };
  it("empty -> 0.00; only unpriced -> '-'", () => {
    expect(formatTotal({ ...base, partial: false }, "totalMc")).toBe("0.00");
    expect(formatTotal({ ...base, unpricedCount: 2, partial: true }, "totalMp")).toBe("-");
  });

  it("priced -> grouped sum", () => {
    expect(
      formatTotal({ ...base, totalMp: "7500.00", pricedCount: 1, partial: false }, "totalMp"),
    ).toBe("7,500.00");
  });
});
