import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseResx, readResx } from "../src/resx";

const FIXTURES = join(import.meta.dirname, "fixtures");
const RESX = join(FIXTURES, "ItemNames.resx");

describe("ItemNames.resx parser (task 3.8, design 10 step 1)", () => {
  it("maps each resource key to its English name", async () => {
    const names = await readResx(RESX);
    expect(names.get("Kris")).toBe("Kris");
    expect(names.get("ShortSword")).toBe("Short Sword");
    expect(names.get("WingsOfElf")).toBe("Wings of Elf");
  });

  it("decodes XML entities and ignores resheader entries", async () => {
    const names = await readResx(RESX);
    expect(names.get("JackOLanternBlessings")).toBe("Jack O'Lantern Blessings");
    expect(names.has("resmimetype")).toBe(false);
    expect(names.has("version")).toBe(false);
  });

  it("trims and collapses whitespace; drops empty values", async () => {
    const names = await readResx(RESX);
    expect(names.get("Padded")).toBe("Padded Name");
    expect(names.has("Empty")).toBe(false);
  });

  it("reads every <data> entry of the fixture", async () => {
    const xml = await readFile(RESX, "utf8");
    const dataEntries = xml.match(/<data name=/g)?.length ?? 0;
    // Every entry except the empty one.
    expect(parseResx(xml).size).toBe(dataEntries - 1);
  });

  it("parses a single <data> entry (not wrapped in an array by the XML parser)", () => {
    const xml = `<root><data name="Kris" xml:space="preserve"><value>Kris</value></data></root>`;
    expect([...parseResx(xml)]).toEqual([["Kris", "Kris"]]);
  });

  it("missing file -> clear error naming the path", async () => {
    const missing = join(FIXTURES, "Nope.resx");
    await expect(readResx(missing)).rejects.toThrow(`ItemNames.resx not found at ${missing}`);
  });

  it("not a resx document -> clear error", () => {
    expect(() => parseResx("<html><body/></html>")).toThrow(/not a \.resx document/);
  });
});
