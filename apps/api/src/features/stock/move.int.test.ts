import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { stockEntry } from "@vaultkeeper/shared/schemas/stock";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  createCharacter,
  createEntry,
  insertGroup,
  insertVault,
  locationId,
} from "../../../test/storage-fixtures";

describe("POST /stock/:id/move (task 4.8, R-STK-2)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let mainId: string;
  let vault2: string;
  let vault3: string;
  let darkLordInv: string;
  let bVault: string;
  let storm: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [storm = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm" },
    ]);
    mainId = (await createAccount(t.app, a.cookie, "Main")).id;
    vault2 = await locationId(t.app, a.cookie, mainId, "Vault 2");
    vault3 = await locationId(t.app, a.cookie, mainId, "Vault 3");
    const alt = await createAccount(t.app, a.cookie, "Alt");
    await createCharacter(t.app, a.cookie, alt.id, "DarkLord");
    darkLordInv = await locationId(t.app, a.cookie, alt.id, "Inventory – DarkLord");
    const bAcc = await createAccount(t.app, b.cookie, "Main");
    bVault = await locationId(t.app, b.cookie, bAcc.id, "Vault 1");
  });
  afterAll(async () => {
    await t.close();
  });

  const move = (id: string, storageLocationId: string, cookie = a.cookie) =>
    sendJson(t.app, "POST", `${STOCK}/${id}/move`, { storageLocationId }, cookie);
  const inVault3 = () =>
    createEntry(t.app, a.cookie, { catalogItemId: storm, storageLocationId: vault3 });
  const locationOf = async (id: string) => {
    const { rows } = await t.database.pool.query<{ storage_location_id: string }>(
      "SELECT storage_location_id FROM stock_entries WHERE id = $1",
      [id],
    );
    return rows[0]?.storage_location_id;
  };

  it("S1: vault 3 -> 'Inventory – DarkLord' (another account), memberships kept", async () => {
    const entry = await inVault3();
    const group = await insertGroup(t.database.pool, a.id, "Sell", [entry.id]);
    const res = await move(entry.id, darkLordInv);
    expect(res.status).toBe(200);
    expect(stockEntry.parse(await res.json())).toMatchObject({
      storageLocationId: darkLordInv,
      locationLabel: "Inventory – DarkLord",
    });
    expect(await locationOf(entry.id)).toBe(darkLordInv);
    expect(
      await countRows(
        t.database.pool,
        "stock_group_entries WHERE group_id = $1 AND stock_entry_id = $2",
        [group, entry.id],
      ),
    ).toBe(1);
  });

  it("S2: into an over-limit vault is 422 VAULT_OVER_LIMIT, entry stays", async () => {
    const entry = await inVault3();
    const vault11 = await insertVault(t.database.pool, a.id, mainId, 11);
    const res = await move(entry.id, vault11);
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.VAULT_OVER_LIMIT);
    expect(await locationOf(entry.id)).toBe(vault3);
  });

  it("R-AUTH-5 S3: into B's location is 404; B moving A's entry is 404", async () => {
    const entry = await inVault3();
    expect((await move(entry.id, bVault)).status).toBe(404);
    expect((await move(entry.id, vault2, b.cookie)).status).toBe(404);
    expect(await locationOf(entry.id)).toBe(vault3);
  });

  it("R-GA-5 S3: moving OUT of an over-limit vault is allowed", async () => {
    const vault12 = await insertVault(t.database.pool, a.id, mainId, 12);
    const { rows } = await t.database.pool.query<{ id: string }>(
      `INSERT INTO stock_entries (user_id, storage_location_id, catalog_item_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [a.id, vault12, storm],
    );
    const id = rows[0]?.id ?? "";
    expect((await move(id, vault2)).status).toBe(200);
    expect(await locationOf(id)).toBe(vault2);
  });
});
