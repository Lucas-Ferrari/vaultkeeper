import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { gameAccount } from "@vaultkeeper/shared/schemas/game-accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createTestApp,
  getWith,
  sendJson,
  signUp,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { useTestDatabase } from "../../../test/db";
import { ACCOUNTS, createAccount, setVaultCount } from "../../../test/storage-fixtures";

const accountList = z.array(gameAccount);

describe("game accounts CRUD + auto vaults (task 4.2)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
  });
  afterAll(async () => {
    await t.close();
  });

  async function list(cookie: string) {
    const res = await getWith(t.app, ACCOUNTS, cookie);
    expect(res.status).toBe(200);
    return accountList.parse(await res.json());
  }

  async function vaultNumbers(accountId: string): Promise<number[]> {
    const { rows } = await t.database.pool.query<{ vault_number: number }>(
      `SELECT vault_number FROM storage_locations
       WHERE game_account_id = $1 AND kind = 'vault' ORDER BY vault_number`,
      [accountId],
    );
    return rows.map((row) => row.vault_number);
  }

  it("R-GA-1 S1: creating Main and Alt lists both, by name", async () => {
    await createAccount(t.app, a.cookie, "Main");
    await createAccount(t.app, a.cookie, "Alt");
    expect((await list(a.cookie)).map((acc) => acc.name)).toEqual(["Alt", "Main"]);
  });

  it("R-GA-1 S2: a second 'main' for the same user is 409", async () => {
    const res = await sendJson(t.app, "POST", ACCOUNTS, { name: "main" }, a.cookie);
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe(ERROR_CODE.CONFLICT);
  });

  it("R-GA-1 S3: another user may reuse the name", async () => {
    await createAccount(t.app, b.cookie, "Main");
  });

  it("R-AUTH-5 S1: B's list does not contain A's accounts", async () => {
    const names = (await list(b.cookie)).map((acc) => acc.name);
    expect(names).toEqual(["Main"]);
    const aIds = (await list(a.cookie)).map((acc) => acc.id);
    expect((await list(b.cookie)).some((acc) => aIds.includes(acc.id))).toBe(false);
  });

  it("R-GA-2 S1: a new account has vaults 1..vault_count and no others", async () => {
    const ten = await createAccount(t.app, a.cookie, "Ten");
    expect(await vaultNumbers(ten.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    await setVaultCount(t.database.pool, 3);
    try {
      const three = await createAccount(t.app, a.cookie, "Three");
      expect(await vaultNumbers(three.id)).toEqual([1, 2, 3]);
    } finally {
      await setVaultCount(t.database.pool, 10);
    }
  });

  it("validates the name (422) and requires a session (401)", async () => {
    expect((await sendJson(t.app, "POST", ACCOUNTS, { name: " " }, a.cookie)).status).toBe(422);
    expect(
      (await sendJson(t.app, "POST", ACCOUNTS, { name: "x".repeat(51) }, a.cookie)).status,
    ).toBe(422);
    expect((await getWith(t.app, ACCOUNTS)).status).toBe(401);
  });

  it("GET /:id reads own account; B gets 404", async () => {
    const acc = await createAccount(t.app, a.cookie, "Readable");
    const ok = await getWith(t.app, `${ACCOUNTS}/${acc.id}`, a.cookie);
    expect(ok.status).toBe(200);
    expect(gameAccount.parse(await ok.json())).toEqual(acc);
    expect((await getWith(t.app, `${ACCOUNTS}/${acc.id}`, b.cookie)).status).toBe(404);
  });

  it("PATCH renames and sets notes; duplicate is 409; B gets 404", async () => {
    const acc = await createAccount(t.app, a.cookie, "Old Name");
    const res = await sendJson(
      t.app,
      "PATCH",
      `${ACCOUNTS}/${acc.id}`,
      { name: "New Name", notes: "farm" },
      a.cookie,
    );
    expect(res.status).toBe(200);
    expect(gameAccount.parse(await res.json())).toMatchObject({ name: "New Name", notes: "farm" });

    const dup = await sendJson(t.app, "PATCH", `${ACCOUNTS}/${acc.id}`, { name: "MAIN" }, a.cookie);
    expect(dup.status).toBe(409);

    const other = await sendJson(t.app, "PATCH", `${ACCOUNTS}/${acc.id}`, { name: "x" }, b.cookie);
    expect(other.status).toBe(404);
    expect((await getWith(t.app, `${ACCOUNTS}/${acc.id}`, a.cookie)).status).toBe(200);
  });

  it("DELETE removes an empty account; B gets 404 and nothing is deleted", async () => {
    const acc = await createAccount(t.app, a.cookie, "Doomed");
    expect(
      (await sendJson(t.app, "DELETE", `${ACCOUNTS}/${acc.id}`, undefined, b.cookie)).status,
    ).toBe(404);
    expect((await getWith(t.app, `${ACCOUNTS}/${acc.id}`, a.cookie)).status).toBe(200);

    expect(
      (await sendJson(t.app, "DELETE", `${ACCOUNTS}/${acc.id}`, undefined, a.cookie)).status,
    ).toBe(204);
    expect((await getWith(t.app, `${ACCOUNTS}/${acc.id}`, a.cookie)).status).toBe(404);
  });

  it("a malformed id is 422, an unknown one 404", async () => {
    expect((await getWith(t.app, `${ACCOUNTS}/nope`, a.cookie)).status).toBe(422);
    expect((await getWith(t.app, `${ACCOUNTS}/${crypto.randomUUID()}`, a.cookie)).status).toBe(404);
  });
});
