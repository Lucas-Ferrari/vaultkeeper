import type { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../../test/db";
import { withClient } from "../../../test/pg-admin";
import { expectPgError, PG_ERROR } from "../../../test/sql";

/** Task 2.7 / design 04, R-CAT-1 S2/S3/S5. */
describe("catalog tables", () => {
  const db = useTestDatabase();
  const run = <T>(fn: (client: Client) => Promise<T>) => withClient(db.current.url, fn);

  async function insertItem(
    client: Client,
    category: string,
    name: string,
    price: string | null = null,
  ): Promise<{ id: string; search_name: string; reference_price_mc: string | null }> {
    const result = await client.query<{
      id: string;
      search_name: string;
      reference_price_mc: string | null;
    }>(
      `INSERT INTO catalog_items (category_slug, name, source, reference_price_mc)
       VALUES ($1, $2, 'admin', $3) RETURNING id, search_name, reference_price_mc`,
      [category, name, price],
    );
    const row = result.rows[0];
    if (!row) throw new Error("insert returned no row");
    return row;
  }

  beforeAll(async () => {
    await run(async (client) => {
      await client.query(
        `INSERT INTO item_categories (slug, name, icon) VALUES
           ('wings', 'Wings', 'wings'), ('swords', 'Swords', 'sword')`,
      );
    });
  });

  it("creates an active item with a null price and a folded search_name (S1)", async () => {
    const row = await run(async (client) => {
      const item = await insertItem(client, "wings", "Wíngs of Ruin");
      const result = await client.query<{ is_active: boolean }>(
        "SELECT is_active FROM catalog_items WHERE id = $1",
        [item.id],
      );
      return { ...item, ...result.rows[0] };
    });

    expect(row).toMatchObject({
      search_name: "wings of ruin",
      reference_price_mc: null,
      is_active: true,
    });
  });

  it("rejects the same name in the same category, case- and accent-insensitive (S2)", async () => {
    await run(async (client) => {
      await insertItem(client, "wings", "Wings of Storm");
      await expectPgError(insertItem(client, "wings", "wings of storm"), PG_ERROR.UNIQUE_VIOLATION);
      await expectPgError(insertItem(client, "wings", "WÍNGS OF STORM"), PG_ERROR.UNIQUE_VIOLATION);
    });
  });

  it("allows the same name in another category (S3)", async () => {
    await run(async (client) => {
      await insertItem(client, "swords", "Wings of Storm");
    });
  });

  it("keeps prices exact: 1500.5 reads back as '1500.50' (S5)", async () => {
    const item = await run((client) => insertItem(client, "swords", "Blade", "1500.5"));
    expect(item.reference_price_mc).toBe("1500.50");
  });

  it("rejects negative prices, empty/long names, unknown categories and sources", async () => {
    await run(async (client) => {
      await expectPgError(insertItem(client, "swords", "Neg", "-1"), PG_ERROR.CHECK_VIOLATION);
      await expectPgError(insertItem(client, "swords", ""), PG_ERROR.CHECK_VIOLATION);
      await expectPgError(insertItem(client, "swords", "x".repeat(121)), PG_ERROR.CHECK_VIOLATION);
      await expectPgError(insertItem(client, "nope", "Ghost"), PG_ERROR.FOREIGN_KEY_VIOLATION);
      await expectPgError(
        client.query(
          `INSERT INTO catalog_items (category_slug, name, source) VALUES ('swords', 'Src', 'scraped')`,
        ),
        PG_ERROR.CHECK_VIOLATION,
      );
    });
  });

  it("rejects category slugs outside ^[a-z0-9-]+$", async () => {
    await run(async (client) => {
      await expectPgError(
        client.query(
          `INSERT INTO item_categories (slug, name, icon) VALUES ('Bad Slug', 'B', 'b')`,
        ),
        PG_ERROR.CHECK_VIOLATION,
      );
    });
  });

  it("indexes search_name with a GIN trigram index", async () => {
    const indexdef = await run(async (client) => {
      const result = await client.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'catalog_items' AND indexdef ILIKE '%gin%'`,
      );
      return result.rows[0]?.indexdef;
    });
    expect(indexdef).toMatch(/USING gin \(search_name gin_trgm_ops\)/);
  });
});
