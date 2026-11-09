import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CATEGORIES, categoryFor, COLLISION_LABELS, type SeedCategory } from "./categories";
import {
  assertParseRate,
  MAX_UNPARSED_RATIO,
  parseItemsDirectory,
  type ParsedItem,
  type UnparsedDefinition,
} from "./cs-parser";
import { readResx } from "./resx";

/** apps/api/src/db/schema/catalog.ts name check (TEXT_LIMIT.CATALOG_ITEM_NAME). */
const NAME_MAX = 120;

export interface SeedItem {
  /** `openmu:s6:<group>:<number>`: the seeder's upsert key (catalog_items.external_key). */
  externalKey: string;
  category: string;
  name: string;
}

/**
 * apps/api/seed/catalog.openmu-s6.json (design 10 step 3). No timestamp on purpose: the same
 * OpenMU commit must give a byte-identical file (R-CAT-4 S5); the commit SHA dates it.
 */
export interface SeedFile {
  source: "openmu";
  season: "s6";
  openmuRepository: string;
  openmuCommit: string;
  license: string;
  categories: SeedCategory[];
  items: SeedItem[];
}

export interface BuiltSeed {
  seed: SeedFile;
  /** Dropped duplicates and renamed collisions, for the operator to review. */
  warnings: string[];
}

export const OPENMU_REPOSITORY = "https://github.com/MUnique/OpenMU";

/** Case- and accent-folded, like catalog_items.search_name (immutable_unaccent(lower(name))). */
function folded(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const byGroupThenNumber = (a: ParsedItem, b: ParsedItem) =>
  a.group - b.group || a.number - b.number;

/** Pure: parsed items -> seed (deduped by group:number, sorted, collision-free names). */
export function buildSeed(items: readonly ParsedItem[], openmuCommit: string): BuiltSeed {
  const warnings: string[] = [];
  const unique = new Map<string, ParsedItem>();
  for (const item of items) {
    const key = `openmu:s6:${item.group}:${item.number}`;
    const kept = unique.get(key);
    if (!kept) unique.set(key, item);
    else if (kept.name !== item.name) {
      warnings.push(
        `${key}: kept "${kept.name}" (${kept.source}:${kept.line}), dropped "${item.name}" (${item.source}:${item.line})`,
      );
    }
  }

  const taken = new Set<string>();
  const seedItems: SeedItem[] = [];
  for (const [externalKey, item] of [...unique].sort(([, a], [, b]) => byGroupThenNumber(a, b))) {
    const category = categoryFor(item.file, item.group);
    let name = item.name;
    if (taken.has(`${category}|${folded(name)}`)) {
      name = `${item.name} (${COLLISION_LABELS[item.file] ?? `${item.group}:${item.number}`})`;
      warnings.push(
        `${externalKey}: "${item.name}" already exists in ${category}, renamed "${name}"`,
      );
    }
    if (name.length > NAME_MAX) {
      throw new Error(`${externalKey}: name is longer than ${NAME_MAX} characters: ${name}`);
    }
    taken.add(`${category}|${folded(name)}`);
    seedItems.push({ externalKey, category, name });
  }

  const used = new Set(seedItems.map((entry) => entry.category));
  return {
    seed: {
      source: "openmu",
      season: "s6",
      openmuRepository: OPENMU_REPOSITORY,
      openmuCommit,
      license: "MIT License, Copyright (c) 2017 MUnique. See NOTICE.",
      categories: CATEGORIES.filter((category) => used.has(category.slug)).map((category) => ({
        ...category,
      })),
      items: seedItems,
    },
    warnings,
  };
}

export interface GenerateInput {
  /** VersionSeasonSix/Items folder. */
  itemsDirectory: string;
  /** Properties/ItemNames.resx. */
  resxPath: string;
  openmuCommit: string;
  /** Base-version files per Season 6 file (see SEASON_SIX_INHERITED_SOURCES). */
  inherited?: Readonly<Record<string, readonly string[]>>;
  maxUnparsedRatio?: number;
}

export interface GenerateResult extends BuiltSeed {
  parsedCount: number;
  unparsed: UnparsedDefinition[];
}

/** Reads the OpenMU sources (as text) and builds the seed; fails above the unparsed limit. */
export async function generateSeed(input: GenerateInput): Promise<GenerateResult> {
  const names = await readResx(input.resxPath);
  const parsed = await parseItemsDirectory(
    input.itemsDirectory,
    names,
    input.inherited ? { inherited: input.inherited } : {},
  );
  assertParseRate(parsed, input.maxUnparsedRatio ?? MAX_UNPARSED_RATIO);
  return {
    ...buildSeed(parsed.items, input.openmuCommit),
    parsedCount: parsed.items.length,
    unparsed: parsed.unparsed,
  };
}

/** Stable text form: 2-space JSON plus a trailing newline. */
export function serializeSeed(seed: SeedFile): string {
  return `${JSON.stringify(seed, null, 2)}\n`;
}

const SHA = /^[0-9a-f]{40}$/;

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * The checked-out commit of a clone, read from .git as text. Running git inside an untrusted
 * clone is avoided on purpose (repository config can make git run commands).
 */
export async function readGitCommit(clone: string): Promise<string> {
  const head = (await readOptional(join(clone, ".git", "HEAD")))?.trim();
  if (head === undefined) {
    throw new Error(`${clone} is not a git checkout (no .git/HEAD); pass --commit <sha>`);
  }
  let commit = head;
  const ref = head.match(/^ref:\s*(\S+)$/)?.[1];
  if (ref) {
    const loose = (await readOptional(join(clone, ".git", ref)))?.trim();
    const packed = (await readOptional(join(clone, ".git", "packed-refs")))
      ?.split("\n")
      .map((line) => line.trim().split(/\s+/))
      .find((parts) => parts[1] === ref)?.[0];
    commit = loose ?? packed ?? "";
  }
  if (!SHA.test(commit)) {
    throw new Error(`could not read a commit SHA from ${join(clone, ".git")} (HEAD: ${head})`);
  }
  return commit;
}
