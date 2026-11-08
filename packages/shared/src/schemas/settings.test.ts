import { describe, expect, it } from "vitest";
import { updateSettingsInput } from "./settings";

describe("updateSettingsInput (R-SET-1)", () => {
  it("accepts a positive exact rate and an integer vault_count 1..50", () => {
    expect(updateSettingsInput.parse({ mcToMpRate: "8", vaultCount: 12 })).toEqual({
      mcToMpRate: "8",
      vaultCount: 12,
    });
    expect(updateSettingsInput.safeParse({ mcToMpRate: "0.0001" }).success).toBe(true);
    expect(updateSettingsInput.safeParse({ vaultCount: 1 }).success).toBe(true);
    expect(updateSettingsInput.safeParse({ vaultCount: 50 }).success).toBe(true);
  });

  it("S2: rate 0, -1, 'abc' (and floats on the wire) are rejected", () => {
    for (const mcToMpRate of ["0", "0.0000", "-1", "abc", 7.5, "12345", "1.23456"]) {
      expect(updateSettingsInput.safeParse({ mcToMpRate }).success).toBe(false);
    }
  });

  it("S3: vault_count 0, 51, 10.5 are rejected", () => {
    for (const vaultCount of [0, 51, 10.5, "10"]) {
      expect(updateSettingsInput.safeParse({ vaultCount }).success).toBe(false);
    }
  });

  it("needs at least one field", () => {
    expect(updateSettingsInput.safeParse({}).success).toBe(false);
  });
});
