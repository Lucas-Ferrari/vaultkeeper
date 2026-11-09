import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
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
  ACCOUNTS,
  CHARACTERS,
  countRows,
  createAccount,
  createCharacter,
  locationId,
} from "../../../test/storage-fixtures";

describe("deletion safety (task 4.5, R-GA-4)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let itemId: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [itemId = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm" },
    ]);
  });
  afterAll(async () => {
    await t.close();
  });

  async function addEntries(locId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await t.database.pool.query(
        "INSERT INTO stock_entries (user_id, storage_location_id, catalog_item_id) VALUES ($1, $2, $3)",
        [a.id, locId, itemId],
      );
    }
  }

  const remove = (path: string) => sendJson(t.app, "DELETE", path, undefined, a.cookie);

  it("S1: a character with 2 entries is 409 STORAGE_NOT_EMPTY count=2, nothing deleted", async () => {
    const acc = await createAccount(t.app, a.cookie, "Main");
    const dl = await createCharacter(t.app, a.cookie, acc.id, "DarkLord");
    await addEntries(await locationId(t.app, a.cookie, acc.id, "Inventory – DarkLord"), 2);

    const res = await remove(`${CHARACTERS}/${dl.id}`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe(ERROR_CODE.STORAGE_NOT_EMPTY);
    expect(body.error.details).toEqual({ count: 2 });
    expect(await countRows(t.database.pool, "characters WHERE id = $1", [dl.id])).toBe(1);
    expect(await countRows(t.database.pool, "stock_entries WHERE user_id = $1", [a.id])).toBe(2);
  });

  it("an account with stock (in a vault) is 409 with the account-wide count", async () => {
    const acc = await createAccount(t.app, a.cookie, "Stocked");
    await createCharacter(t.app, a.cookie, acc.id, "Elf");
    await addEntries(await locationId(t.app, a.cookie, acc.id, "Vault 2"), 1);
    await addEntries(await locationId(t.app, a.cookie, acc.id, "Inventory – Elf"), 2);

    const res = await remove(`${ACCOUNTS}/${acc.id}`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error).toMatchObject({ code: ERROR_CODE.STORAGE_NOT_EMPTY, details: { count: 3 } });
    expect(await countRows(t.database.pool, "game_accounts WHERE id = $1", [acc.id])).toBe(1);
    expect(
      await countRows(t.database.pool, "storage_locations WHERE game_account_id = $1", [acc.id]),
    ).toBe(11);
  });

  it("S2: deleting an empty account removes its characters and vaults", async () => {
    const alt = await createAccount(t.app, a.cookie, "Alt");
    await createCharacter(t.app, a.cookie, alt.id, "Wizard");
    expect((await remove(`${ACCOUNTS}/${alt.id}`)).status).toBe(204);
    expect(await countRows(t.database.pool, "game_accounts WHERE id = $1", [alt.id])).toBe(0);
    expect(
      await countRows(t.database.pool, "characters WHERE game_account_id = $1", [alt.id]),
    ).toBe(0);
    expect(
      await countRows(t.database.pool, "storage_locations WHERE game_account_id = $1", [alt.id]),
    ).toBe(0);
  });

  it("deleting an empty character removes its inventory only", async () => {
    const acc = await createAccount(t.app, a.cookie, "Solo");
    const ch = await createCharacter(t.app, a.cookie, acc.id, "Summoner");
    expect((await remove(`${CHARACTERS}/${ch.id}`)).status).toBe(204);
    expect(
      await countRows(t.database.pool, "storage_locations WHERE character_id = $1", [ch.id]),
    ).toBe(0);
    expect(
      await countRows(t.database.pool, "storage_locations WHERE game_account_id = $1", [acc.id]),
    ).toBe(10);
  });
});
