import { performance } from "node:perf_hooks";
import { catalogItemPage } from "@vaultkeeper/shared/schemas/catalog";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchSelect, WORD_SIMILARITY_THRESHOLD } from "../../src/features/catalog/repository";
import { createTestApp, getWith, signUp, type SignedInUser, type TestApp } from "../auth-helpers";
import { insertCategories, SEARCH_CATEGORIES } from "../catalog-fixtures";
import { useTestDatabase } from "../db";

/** R-SRCH-3 S1: 10k items, 100 typical queries, p95 <= 300 ms (local run; VPS check is 7.4). */
const ITEM_COUNT = 10_000;
const QUERY_COUNT = 100;
const P95_BUDGET_MS = 300;
const TRGM_INDEX = "catalog_items_search_name_trgm_idx";
const CATEGORY_ACTIVE_INDEX = "catalog_items_category_active_idx";

const ADJECTIVES = [
  "Ancient",
  "Blazing",
  "Crimson",
  "Divine",
  "Eternal",
  "Frozen",
  "Grand",
  "Holy",
  "Infernal",
  "Jade",
  "Legendary",
  "Mystic",
  "Noble",
  "Obsidian",
  "Phantom",
  "Royal",
  "Shadow",
  "Thunder",
  "Vicious",
  "Wrathful",
];
const NOUNS = [
  "Blade",
  "Staff",
  "Wings",
  "Helm",
  "Armor",
  "Gloves",
  "Boots",
  "Pants",
  "Shield",
  "Bow",
  "Crossbow",
  "Scepter",
  "Spear",
  "Axe",
  "Mace",
  "Orb",
  "Scroll",
  "Ring",
  "Pendant",
  "Jewel",
  "Cape",
  "Stick",
  "Claw",
  "Book",
  "Seed",
];
const SUFFIXES = [
  "of Storm",
  "of Despair",
  "of Heaven",
  "of Satan",
  "of Dragon",
  "of Soul",
  "of Chaos",
  "of Destruction",
  "of the Dawn",
  "of Illusion",
  "of Eternity",
  "of Fury",
  "of Kundun",
  "of Lord",
  "of Elf",
  "of Spirits",
  "of Darkness",
  "of Thunder",
  "of Glory",
  "of Ruin",
];

/** Deterministic, unique MU-like names spread over the search categories. */
function generatedItems(count: number): { categorySlug: string; name: string }[] {
  const rows: { categorySlug: string; name: string }[] = [];
  for (let index = 0; rows.length < count; index += 1) {
    const adjective = ADJECTIVES[index % ADJECTIVES.length];
    const noun = NOUNS[Math.floor(index / ADJECTIVES.length) % NOUNS.length];
    const suffix =
      SUFFIXES[Math.floor(index / (ADJECTIVES.length * NOUNS.length)) % SUFFIXES.length];
    const category = SEARCH_CATEGORIES[index % SEARCH_CATEGORIES.length];
    if (!adjective || !noun || !suffix || !category)
      throw new Error("vocabulary index out of range");
    rows.push({ categorySlug: category.slug, name: `${adjective} ${noun} ${suffix}` });
  }
  return rows;
}

/** What players type: exact names, partials, typos, multi-typo, short prefixes. */
const TYPICAL_QUERIES = [
  "wings of storm",
  "wigns of strom",
  "storm",
  "excelent wigs",
  "dragon",
  "blade of chaos",
  "legendary staff",
  "legndary staf",
  "jewel",
  "ring of fury",
  "mystic orb",
  "kundun",
  "shadow cape",
  "thunder",
  "royal shield",
  "obsidian",
  "ph",
  "divine bow of heaven",
  "crim",
  "eternal wings",
];

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index] ?? Number.NaN;
}

interface PlanNode {
  "Index Name"?: string;
  Plans?: PlanNode[];
}

function indexNames(node: PlanNode): string[] {
  return [
    ...(node["Index Name"] ? [node["Index Name"]] : []),
    ...(node.Plans ?? []).flatMap(indexNames),
  ];
}

describe("catalog search performance (task 3.7, R-SRCH-3)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let member: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    await insertCategories(t.database.pool, SEARCH_CATEGORIES);
    const rows = generatedItems(ITEM_COUNT);
    await t.database.pool.query(
      `INSERT INTO catalog_items (category_slug, name, source)
       SELECT category_slug, name, 'admin' FROM unnest($1::text[], $2::text[]) AS r(category_slug, name)`,
      [rows.map((row) => row.categorySlug), rows.map((row) => row.name)],
    );
    await t.database.pool.query("ANALYZE catalog_items");
    member = await signUp(t.app);
  });
  afterAll(async () => {
    await t.close();
  });

  async function timedSearch(q: string): Promise<number> {
    const started = performance.now();
    const res = await getWith(
      t.app,
      `/api/v1/catalog/items?${new URLSearchParams({ q }).toString()}`,
      member.cookie,
    );
    const body: unknown = await res.json();
    const elapsed = performance.now() - started;
    expect(res.status).toBe(200);
    catalogItemPage.parse(body);
    return elapsed;
  }

  it(`has ${ITEM_COUNT} items`, async () => {
    const { rows } = await t.database.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM catalog_items",
    );
    expect(rows[0]?.n).toBe(ITEM_COUNT);
  });

  it(`answers ${QUERY_COUNT} typical queries with p95 <= ${P95_BUDGET_MS} ms (S1)`, async () => {
    for (const q of TYPICAL_QUERIES.slice(0, 5)) await timedSearch(q); // warm-up
    const timings: number[] = [];
    for (let index = 0; index < QUERY_COUNT; index += 1) {
      timings.push(await timedSearch(TYPICAL_QUERIES[index % TYPICAL_QUERIES.length] ?? "storm"));
    }
    const sorted = [...timings].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const max = sorted.at(-1) ?? Number.NaN;
    console.info(
      `[perf] search over ${ITEM_COUNT} items, ${QUERY_COUNT} queries: ` +
        `p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${max.toFixed(1)} ms`,
    );
    expect(p95).toBeLessThanOrEqual(P95_BUDGET_MS);
  });

  /** EXPLAIN of the real search query, in a transaction with the search threshold set. */
  async function explainSearch(q: string, options: { seqScan: boolean }): Promise<PlanNode> {
    const query = searchSelect(t.database.db, {
      q,
      active: true,
      category: undefined,
      limit: 20,
      offset: 0,
    }).toSQL();
    const client = await t.database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('pg_trgm.word_similarity_threshold', $1, true)", [
        String(WORD_SIMILARITY_THRESHOLD),
      ]);
      if (!options.seqScan) {
        // Leave the planner only two ways in: a seq scan (disabled) or the trigram index. The
        // (category_slug, is_active) btree would otherwise be picked as a pointless bitmap.
        await client.query(`DROP INDEX ${CATEGORY_ACTIVE_INDEX}`);
        await client.query("SET LOCAL enable_seqscan = off");
      }
      const { rows } = await client.query<{ "QUERY PLAN": [{ Plan: PlanNode }] }>(
        `EXPLAIN (FORMAT JSON) ${query.sql}`,
        query.params,
      );
      const plan = rows[0]?.["QUERY PLAN"][0].Plan;
      if (!plan) throw new Error("EXPLAIN returned no plan");
      return plan;
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  // The predicate must be index-capable: when a seq scan is not an option, the planner has to
  // reach for the GIN trigram index (a predicate like `word_similarity(...) >= 0.3` could not).
  // With seq scans allowed, Postgres may still prefer one on a table this small; that choice is
  // logged, not asserted (it depends on statistics, not on the query shape).
  it.each(["wigns of strom", "excelent wigs", "storm"])(
    "the query for %j can be served by the GIN trigram index on search_name",
    async (q) => {
      const forced = await explainSearch(q, { seqScan: false });
      expect(indexNames(forced), JSON.stringify(forced)).toContain(TRGM_INDEX);

      const chosen = await explainSearch(q, { seqScan: true });
      console.info(
        `[perf] default plan for ${JSON.stringify(q)}: ` +
          (indexNames(chosen).includes(TRGM_INDEX) ? "GIN trigram index" : "seq scan"),
      );
    },
  );
});
