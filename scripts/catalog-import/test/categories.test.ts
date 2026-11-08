import { describe, expect, it } from "vitest";
import { CATEGORIES, categoryFor } from "../src/categories";

describe("OpenMU file/group -> catalog category (task 3.9, design 10)", () => {
  it.each([
    [0, "swords"],
    [1, "axes"],
    [2, "maces"],
    [3, "spears"],
    [4, "bows"],
    [5, "staffs"],
  ])("weapons by group: %i -> %s", (group, slug) => {
    expect(categoryFor("Weapons.cs", group)).toBe(slug);
  });

  it.each([
    [6, "shields"],
    [7, "helms"],
    [8, "armors"],
    [9, "pants"],
    [10, "gloves"],
    [11, "boots"],
  ])("Armors.cs is split by group: %i -> %s", (group, slug) => {
    expect(categoryFor("Armors.cs", group)).toBe(slug);
  });

  it("equipment groups win over the file (lucky armors land with the other helms)", () => {
    expect(categoryFor("LuckyItems.cs", 7)).toBe("helms");
  });

  it("groups 12-15 are mixed in MU, so the file decides", () => {
    expect(categoryFor("Wings.cs", 12)).toBe("wings");
    expect(categoryFor("Wings.cs", 13)).toBe("wings"); // Cape of Lord, feathers
    expect(categoryFor("Orbs.cs", 12)).toBe("orbs");
    expect(categoryFor("Jewels.cs", 14)).toBe("jewels");
    expect(categoryFor("PackedJewels.cs", 12)).toBe("jewels");
    expect(categoryFor("Jewelery.cs", 13)).toBe("jewelry");
    expect(categoryFor("Potions.cs", 14)).toBe("potions");
    expect(categoryFor("Scrolls.cs", 15)).toBe("scrolls");
    expect(categoryFor("LuckyItems.cs", 13)).toBe("misc");
  });

  it("an item file with no category mapping is an error, not a silent 'misc'", () => {
    expect(() => categoryFor("NewThing.cs", 14)).toThrow(/no category for NewThing\.cs/);
  });

  it("every category has a valid unique slug, a name, an icon and a unique sort order", () => {
    const slugs = CATEGORIES.map((category) => category.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(CATEGORIES.map((category) => category.sortOrder)).size).toBe(CATEGORIES.length);
    for (const category of CATEGORIES) {
      expect(category.slug).toMatch(/^[a-z0-9-]+$/);
      expect(category.name.length).toBeGreaterThan(0);
      expect(category.icon.length).toBeGreaterThan(0);
    }
  });

  it("every slug categoryFor can return is a declared category", () => {
    const declared = new Set(CATEGORIES.map((category) => category.slug));
    const files = [
      "Weapons.cs",
      "Armors.cs",
      "Wings.cs",
      "Orbs.cs",
      "Scrolls.cs",
      "Jewels.cs",
      "PackedJewels.cs",
      "Jewelery.cs",
      "Pets.cs",
      "Potions.cs",
      "Misc.cs",
      "SocketSystem.cs",
      "BoxOfLuck.cs",
      "BuffItems.cs",
      "EventTicketItems.cs",
      "Quest.cs",
      "LuckyItems.cs",
      "CashShopItems.cs",
      "CraftingTalismans.cs",
      "GensRewardItems.cs",
    ];
    for (const file of files) {
      for (let group = 0; group <= 15; group += 1) {
        expect(declared.has(categoryFor(file, group)), `${file} group ${group}`).toBe(true);
      }
    }
  });
});
