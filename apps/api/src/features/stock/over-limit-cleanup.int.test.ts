import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestApp,
  sendJson,
  signUp,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { insertCategories, insertItems } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";
import {
  STOCK,
  countRows,
  createAccount,
  insertVault,
  locationId,
} from "../../../test/storage-fixtures";

describe("over-limit vault removed once emptied (task 5.8, R-GA-5)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let mainId: string;
  let vault2: string;
  let vault3: string;
  let item: string;
  let vault12: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [item = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm" },
    ]);
    mainId = (await createAccount(t.app, a.cookie, "Main")).id;
    vault2 = await locationId(t.app, a.cookie, mainId, "Vault 2");
    vault3 = await locationId(t.app, a.cookie, mainId, "Vault 3");
  });
  beforeEach(async () => {
    await t.database.pool.query(
      "DELETE FROM stock_entries WHERE storage_location_id IN (SELECT id FROM storage_locations WHERE vault_number = 12)",
    );
    await t.database.pool.query("DELETE FROM storage_locations WHERE vault_number = 12");
    vault12 = await insertVault(t.database.pool, a.id, mainId, 12);
  });
  afterAll(async () => {
    await t.close();
  });

  /** Stock left behind in a vault above the limit (as after lowering vault_count). */
  async function rawEntry(locationIdValue: string): Promise<string> {
    const { rows } = await t.database.pool.query<{ id: string }>(
      `INSERT INTO stock_entries (user_id, storage_location_id, catalog_item_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [a.id, locationIdValue, item],
    );
    return rows[0]?.id ?? "";
  }
  const exists = async (id: string) =>
    (await countRows(t.database.pool, "storage_locations WHERE id = $1", [id])) === 1;
  const move = (id: string, to: string) =>
    sendJson(t.app, "POST", `${STOCK}/${id}/move`, { storageLocationId: to }, a.cookie);
  const remove = (id: string) => sendJson(t.app, "DELETE", `${STOCK}/${id}`, undefined, a.cookie);

  it("moving the LAST entry out deletes the over-limit vault", async () => {
    const id = await rawEntry(vault12);
    expect((await move(id, vault2)).status).toBe(200);
    expect(await exists(vault12)).toBe(false);
  });

  it("deleting the LAST entry deletes the over-limit vault", async () => {
    const id = await rawEntry(vault12);
    expect((await remove(id)).status).toBe(204);
    expect(await exists(vault12)).toBe(false);
  });

  it("a non-last entry keeps the vault until it is empty", async () => {
    const [first, second] = [await rawEntry(vault12), await rawEntry(vault12)];
    expect((await move(first, vault2)).status).toBe(200);
    expect(await exists(vault12)).toBe(true);
    expect((await remove(second)).status).toBe(204);
    expect(await exists(vault12)).toBe(false);
  });

  it("an empty vault within the limit is never deleted", async () => {
    const id = await rawEntry(vault3);
    expect((await move(id, vault2)).status).toBe(200);
    expect(await exists(vault3)).toBe(true);
    const other = await rawEntry(vault3);
    expect((await remove(other)).status).toBe(204);
    expect(await exists(vault3)).toBe(true);
  });
});
