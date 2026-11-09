import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertParseRate,
  parseItemsDirectory,
  parseItemsFile,
  splitArguments,
  stripComments,
  type ParseResult,
} from "../src/cs-parser";
import { readResx, type ResourceNames } from "../src/resx";

const FIXTURES = join(import.meta.dirname, "fixtures");
const ITEMS = join(FIXTURES, "Items");

let names: ResourceNames;

beforeAll(async () => {
  names = await readResx(join(FIXTURES, "ItemNames.resx"));
});

async function parseFixture(file: string): Promise<ParseResult> {
  return parseItemsFile(file, await readFile(join(ITEMS, file), "utf8"), names);
}

const brief = (result: ParseResult) =>
  result.items.map(({ group, number, name }) => ({ group, number, name }));

describe("C# source helpers", () => {
  it("strips line and block comments but keeps strings that look like comments", () => {
    const source = `a(); // x\nb("// not a comment", '/'); /* gone\n still gone */ c(@"/* kept */");`;
    expect(stripComments(source)).toBe(`a(); \nb("// not a comment", '/'); \n c(@"/* kept */");`);
  });

  it("splits call arguments at top-level commas only", () => {
    expect(
      splitArguments(
        `0, LocalizedString.FromResource(() => ItemNames.Kris), "a, b", this.F((1, 2)), x`,
      ),
    ).toEqual([
      "0",
      "LocalizedString.FromResource(() => ItemNames.Kris)",
      `"a, b"`,
      "this.F((1, 2))",
      "x",
    ]);
  });
});

describe(".cs item parser (task 3.9, design 10 step 2)", () => {
  it("CreateWeapon(group, number, ..., name at 7): resource and literal names", async () => {
    const result = await parseFixture("Weapons.cs");
    expect(brief(result)).toEqual([
      { group: 0, number: 0, name: "Kris" },
      { group: 0, number: 1, name: "Short Sword" },
      { group: 5, number: 0, name: "Literal Staff" },
      { group: 5, number: 1, name: `Wrapped "Quoted" Staff` },
    ]);
    // Commented-out calls and the factory's own body are not items, nor parse failures.
    expect(result.unparsed).toEqual([]);
  });

  it("records file and line of each definition", async () => {
    const [kris] = (await parseFixture("Weapons.cs")).items;
    expect(kris).toMatchObject({ file: "Weapons.cs", line: 9 });
  });

  it("armor factories: group = slot + 5, gloves 10, boots 11, overloads picked by arity", async () => {
    const result = await parseFixture("Armors.cs");
    expect(brief(result)).toEqual([
      { group: 6, number: 0, name: "Small Shield" },
      { group: 7, number: 0, name: "Bronze Helm" },
      { group: 7, number: 6, name: "Scale Helm" },
      { group: 8, number: 0, name: "Bronze Armor" },
      { group: 9, number: 0, name: "Bronze Pants" },
      { group: 10, number: 0, name: "Bronze Gloves" },
      { group: 11, number: 0, name: "Bronze Boots" },
      { group: 11, number: 1, name: "Old Boots" },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("wings: factory calls, a later `x.Group = 13` override, inline definitions, no forwarding calls", async () => {
    const result = await parseFixture("Wings.cs");
    expect(brief(result)).toEqual([
      { group: 12, number: 0, name: "Wings of Elf" },
      { group: 13, number: 30, name: "Cape of Lord" },
      { group: 12, number: 130, name: "Small Cape of Lord" },
      { group: 13, number: 14, name: "Feather" },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("inline `x = Context.CreateNew<ItemDefinition>()` blocks with literals, casts and constants", async () => {
    const result = await parseFixture("Potions.cs");
    expect(brief(result)).toEqual([
      { group: 14, number: 70, name: "Elite Healing Potion" },
      { group: 14, number: 0, name: "Apple" },
      { group: 14, number: 7, name: "Siege Potion" },
      { group: 14, number: 46, name: "Jack O'Lantern Blessings" },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("logs calls it cannot resolve (loop variables, unknown resource keys) instead of guessing", async () => {
    const result = await parseFixture("SocketSystem.cs");
    expect(brief(result)).toEqual([{ group: 12, number: 70, name: "Sphere (Mono)" }]);
    expect(result.unparsed).toEqual([
      expect.objectContaining({
        file: "SocketSystem.cs",
        line: 12,
        method: "Initialize",
        reason: expect.stringContaining("CreateSeed"),
      }),
      expect.objectContaining({
        file: "SocketSystem.cs",
        line: 16,
        reason: expect.stringContaining("NoSuchResourceKey"),
      }),
    ]);
  });

  it("an inline definition fed by parameters of a non-factory method is unparsed, naming the method", async () => {
    const result = await parseFixture("GensRewardItems.cs");
    expect(result.items).toEqual([]);
    expect(result.unparsed).toEqual([
      expect.objectContaining({ method: "CreateCase", reason: expect.stringMatching(/Number/) }),
    ]);
  });

  it("parses a directory in file-name order and skips rule/option/ancient-set files", async () => {
    const result = await parseItemsDirectory(ITEMS, names);
    const files = [...new Set(result.items.map((item) => item.file))];
    expect(files).toEqual([
      "Armors.cs",
      "Jewels.cs",
      "LuckyItems.cs",
      "Potions.cs",
      "SocketSystem.cs",
      "Weapons.cs",
      "Wings.cs",
    ]);
    expect(result.items.some((item) => item.number === 7 && item.group === 0)).toBe(false);
    expect(result.items).toHaveLength(23);
    expect(result.unparsed).toHaveLength(3);
  });

  it("also reads the older-version base classes a Season 6 file inherits items from", async () => {
    const result = await parseItemsDirectory(ITEMS, names, {
      inherited: { "Jewels.cs": ["../Version075/Items/Jewels.cs"] },
    });
    const jewels = result.items.filter((item) => item.file === "Jewels.cs");
    expect(
      jewels.map(({ group, number, name, source }) => ({ group, number, name, source })),
    ).toEqual([
      { group: 14, number: 31, name: "Jewel of Guardian", source: "Jewels.cs" },
      { group: 14, number: 13, name: "Jewel of Bless", source: "../Version075/Items/Jewels.cs" },
    ]);
  });

  it("fails when more than 2% of definitions are unparseable, listing them", async () => {
    const result = await parseItemsDirectory(ITEMS, names);
    expect(() => assertParseRate(result)).toThrow(
      /3 of 26 item definitions \(11\.5%\) could not be parsed/,
    );
    expect(() => assertParseRate(result)).toThrow(/SocketSystem\.cs:12/);
  });

  it("passes at or under the 2% limit", () => {
    const items = Array.from({ length: 98 }, (_, number) => ({
      group: 0,
      number,
      name: `I${number}`,
      file: "W.cs",
      source: "W.cs",
      line: 1,
    }));
    const unparsed = [1, 2].map((line) => ({
      file: "W.cs",
      source: "W.cs",
      line,
      method: "M",
      reason: "r",
    }));
    expect(() => assertParseRate({ items, unparsed })).not.toThrow();
    expect(() => assertParseRate({ items: items.slice(1), unparsed })).toThrow(/2\.0%/);
  });
});
