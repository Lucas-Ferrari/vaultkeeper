import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  getWith,
  sendJson,
  signUp,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { insertCategories, insertItems } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";
import {
  ACCOUNTS,
  createAccount,
  createCharacter,
  getStorage,
  insertVault,
  setVaultCount,
} from "../../../test/storage-fixtures";

describe("account storage listing (task 4.4)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let accountId: string;
  let itemId: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    accountId = (await createAccount(t.app, a.cookie, "Main")).id;
    await createCharacter(t.app, a.cookie, accountId, "DarkLord");
    await createCharacter(t.app, a.cookie, accountId, "Archer");
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    [itemId = ""] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: "Wings of Storm" },
    ]);
  });
  afterAll(async () => {
    await t.close();
  });

  it("R-GA-3 S3: inventories (by character) then vaults, labeled, with counts", async () => {
    const storage = await getStorage(t.app, a.cookie, accountId);
    expect(storage.accountId).toBe(accountId);
    expect(storage.vaultCount).toBe(10);
    expect(storage.locations.map((l) => l.label)).toEqual([
      "Inventory – Archer",
      "Inventory – DarkLord",
      ...Array.from({ length: 10 }, (_, i) => `Vault ${i + 1}`),
    ]);
    expect(storage.locations.every((l) => l.entryCount === 0 && !l.overLimit)).toBe(true);
    const dl = storage.locations.find((l) => l.label === "Inventory – DarkLord");
    expect(dl).toMatchObject({ kind: "inventory", characterName: "DarkLord", vaultNumber: null });
  });

  it("counts entries per location", async () => {
    const storage = await getStorage(t.app, a.cookie, accountId);
    const vault3 = storage.locations.find((l) => l.label === "Vault 3");
    for (let i = 0; i < 2; i += 1) {
      await t.database.pool.query(
        "INSERT INTO stock_entries (user_id, storage_location_id, catalog_item_id) VALUES ($1, $2, $3)",
        [a.id, vault3?.id, itemId],
      );
    }
    const after = await getStorage(t.app, a.cookie, accountId);
    expect(after.locations.find((l) => l.label === "Vault 3")?.entryCount).toBe(2);
    expect(after.locations.find((l) => l.label === "Vault 4")?.entryCount).toBe(0);
  });

  it("R-GA-5: overLimit = vault_number > vault_count", async () => {
    const extra = await insertVault(t.database.pool, a.id, accountId, 11);
    let storage = await getStorage(t.app, a.cookie, accountId);
    expect(storage.locations.find((l) => l.id === extra)).toMatchObject({
      label: "Vault 11",
      overLimit: true,
    });
    await setVaultCount(t.database.pool, 11);
    try {
      storage = await getStorage(t.app, a.cookie, accountId);
      expect(storage.locations.find((l) => l.id === extra)?.overLimit).toBe(false);
    } finally {
      await setVaultCount(t.database.pool, 10);
    }
  });

  it("R-GA-2 S2: there is no route to add or delete a vault (404)", async () => {
    const storage = await getStorage(t.app, a.cookie, accountId);
    const vault = storage.locations.find((l) => l.kind === "vault");
    expect(
      (
        await sendJson(
          t.app,
          "POST",
          `${ACCOUNTS}/${accountId}/storage`,
          { vaultNumber: 12 },
          a.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (await sendJson(t.app, "POST", `${ACCOUNTS}/${accountId}/vaults`, {}, a.cookie)).status,
    ).toBe(404);
    expect(
      (
        await sendJson(
          t.app,
          "DELETE",
          `/api/v1/storage-locations/${vault?.id}`,
          undefined,
          a.cookie,
        )
      ).status,
    ).toBe(404);
  });

  it("R-AUTH-5: B gets 404 for A's storage", async () => {
    expect((await getWith(t.app, `${ACCOUNTS}/${accountId}/storage`, b.cookie)).status).toBe(404);
  });
});
