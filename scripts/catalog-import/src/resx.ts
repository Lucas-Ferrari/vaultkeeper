import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";

/** Resource key -> English item name, e.g. "ShortSword" -> "Short Sword" (design 10 step 1). */
export type ResourceNames = ReadonlyMap<string, string>;

interface ResxData {
  "@_name"?: unknown;
  value?: unknown;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep every value a string ("1" must not become a number).
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === "data",
});

function normalized(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parses a .NET .resx document. Whitespace is trimmed and collapsed; empty values are dropped
 * (a nameless item is unusable, so its lookups fail loudly in the .cs parser instead).
 */
export function parseResx(xml: string): ResourceNames {
  const document: unknown = parser.parse(xml);
  const root = isRecord(document) ? document["root"] : undefined;
  if (!isRecord(root)) throw new Error("not a .resx document: no <root> element");
  const entries = Array.isArray(root["data"]) ? (root["data"] as ResxData[]) : [];
  const names = new Map<string, string>();
  for (const entry of entries) {
    const key = normalized(entry["@_name"]);
    const value = normalized(entry.value);
    if (key && value) names.set(key, value);
  }
  return names;
}

/** Reads and parses ItemNames.resx; a missing file is a clear, path-naming error. */
export async function readResx(path: string): Promise<ResourceNames> {
  let xml: string;
  try {
    xml = await readFile(path, "utf8");
  } catch (cause) {
    if (isRecord(cause) && cause["code"] === "ENOENT") {
      throw new Error(`ItemNames.resx not found at ${path}`, { cause });
    }
    throw cause;
  }
  return parseResx(xml);
}
