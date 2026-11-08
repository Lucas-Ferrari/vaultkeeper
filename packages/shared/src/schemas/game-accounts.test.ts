import { describe, expect, it } from "vitest";
import {
  accountStorage,
  characterName,
  createCharacterInput,
  createGameAccountInput,
  gameAccountName,
  updateCharacterInput,
  updateGameAccountInput,
} from "./game-accounts";

describe("gameAccountName (R-GA-1: trimmed, 1..50)", () => {
  it("trims and accepts 1 and 50 chars", () => {
    expect(gameAccountName.parse("  Main  ")).toBe("Main");
    expect(gameAccountName.parse("a".repeat(50))).toHaveLength(50);
  });

  it("rejects empty, blank and 51 chars", () => {
    expect(gameAccountName.safeParse("").success).toBe(false);
    expect(gameAccountName.safeParse("   ").success).toBe(false);
    expect(gameAccountName.safeParse("a".repeat(51)).success).toBe(false);
  });
});

describe("characterName (R-GA-3: trimmed, 1..30; spec wins over design 05)", () => {
  it("accepts 1 and 30 chars", () => {
    expect(characterName.parse(" DarkLord ")).toBe("DarkLord");
    expect(characterName.parse("a".repeat(30))).toHaveLength(30);
  });

  it("rejects blank and 31 chars", () => {
    expect(characterName.safeParse(" ").success).toBe(false);
    expect(characterName.safeParse("a".repeat(31)).success).toBe(false);
  });
});

describe("account and character inputs", () => {
  it("create account: name required, notes optional", () => {
    expect(createGameAccountInput.parse({ name: "Main" })).toEqual({ name: "Main" });
    expect(createGameAccountInput.safeParse({}).success).toBe(false);
    expect(createGameAccountInput.safeParse({ name: "Main", notes: "x".repeat(501) }).success).toBe(
      false,
    );
  });

  it("update account needs at least one field", () => {
    expect(updateGameAccountInput.safeParse({}).success).toBe(false);
    expect(updateGameAccountInput.parse({ name: " Alt " })).toEqual({ name: "Alt" });
  });

  it("create character: class optional and nullable", () => {
    expect(createCharacterInput.parse({ name: "DarkLord" })).toEqual({ name: "DarkLord" });
    expect(createCharacterInput.parse({ name: "Elfa", class: null })).toEqual({
      name: "Elfa",
      class: null,
    });
    expect(createCharacterInput.parse({ name: "Elfa", class: " Muse Elf " }).class).toBe(
      "Muse Elf",
    );
  });

  it("update character needs at least one field", () => {
    expect(updateCharacterInput.safeParse({}).success).toBe(false);
    expect(updateCharacterInput.parse({ name: "DL" })).toEqual({ name: "DL" });
  });
});

describe("accountStorage DTO", () => {
  it("parses labeled locations with counts and the over-limit flag", () => {
    const parsed = accountStorage.parse({
      accountId: "7b0c7e2a-3f1d-4c55-9a7e-2f4b8d1c6e90",
      vaultCount: 10,
      locations: [
        {
          id: "7b0c7e2a-3f1d-4c55-9a7e-2f4b8d1c6e90",
          kind: "vault",
          label: "Vault 1",
          vaultNumber: 1,
          characterId: null,
          characterName: null,
          entryCount: 0,
          overLimit: false,
        },
      ],
    });
    expect(parsed.locations[0]?.label).toBe("Vault 1");
  });
});
