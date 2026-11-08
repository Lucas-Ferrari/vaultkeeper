import { character } from "@vaultkeeper/shared/schemas/game-accounts";
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
import {
  ACCOUNTS,
  CHARACTERS,
  countRows,
  createAccount,
  createCharacter,
} from "../../../test/storage-fixtures";

const characterList = z.array(character);

describe("characters + inventory (task 4.3)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let a: SignedInUser;
  let b: SignedInUser;
  let mainId: string;
  let altId: string;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    a = await signUp(t.app);
    b = await signUp(t.app);
    mainId = (await createAccount(t.app, a.cookie, "Main")).id;
    altId = (await createAccount(t.app, a.cookie, "Alt")).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const inventories = (characterId: string) =>
    countRows(t.database.pool, "storage_locations WHERE character_id = $1 AND kind = 'inventory'", [
      characterId,
    ]);

  it("R-GA-3 S1: creating DarkLord in Main auto-creates exactly one inventory", async () => {
    const dl = await createCharacter(t.app, a.cookie, mainId, "DarkLord");
    expect(dl).toMatchObject({ name: "DarkLord", gameAccountId: mainId, class: null });
    expect(await inventories(dl.id)).toBe(1);
  });

  it("R-GA-3 S2: 'darklord' again in Main is 409, in Alt allowed", async () => {
    const dup = await sendJson(
      t.app,
      "POST",
      `${ACCOUNTS}/${mainId}/characters`,
      { name: "darklord" },
      a.cookie,
    );
    expect(dup.status).toBe(409);
    await createCharacter(t.app, a.cookie, altId, "darklord");
  });

  it("lists an account's characters by name; B gets 404 on A's account", async () => {
    await createCharacter(t.app, a.cookie, mainId, "BladeKnight");
    const res = await getWith(t.app, `${ACCOUNTS}/${mainId}/characters`, a.cookie);
    expect(res.status).toBe(200);
    expect(characterList.parse(await res.json()).map((c) => c.name)).toEqual([
      "BladeKnight",
      "DarkLord",
    ]);
    expect((await getWith(t.app, `${ACCOUNTS}/${mainId}/characters`, b.cookie)).status).toBe(404);
    const create = await sendJson(
      t.app,
      "POST",
      `${ACCOUNTS}/${mainId}/characters`,
      { name: "Intruder" },
      b.cookie,
    );
    expect(create.status).toBe(404);
  });

  it("renames and sets the class; duplicate rename is 409", async () => {
    const sm = await createCharacter(t.app, a.cookie, mainId, "SoulMaster");
    const res = await sendJson(
      t.app,
      "PATCH",
      `${CHARACTERS}/${sm.id}`,
      { name: "GrandMaster", class: "Grand Master" },
      a.cookie,
    );
    expect(res.status).toBe(200);
    expect(character.parse(await res.json())).toMatchObject({
      name: "GrandMaster",
      class: "Grand Master",
    });
    const dup = await sendJson(
      t.app,
      "PATCH",
      `${CHARACTERS}/${sm.id}`,
      { name: "DARKLORD" },
      a.cookie,
    );
    expect(dup.status).toBe(409);
  });

  it("R-AUTH-5 S2: B cannot rename or delete A's character (404, unchanged)", async () => {
    const elf = await createCharacter(t.app, a.cookie, mainId, "Elf");
    const patch = await sendJson(
      t.app,
      "PATCH",
      `${CHARACTERS}/${elf.id}`,
      { name: "Mine" },
      b.cookie,
    );
    expect(patch.status).toBe(404);
    const del = await sendJson(t.app, "DELETE", `${CHARACTERS}/${elf.id}`, undefined, b.cookie);
    expect(del.status).toBe(404);
    expect(
      await countRows(t.database.pool, "characters WHERE id = $1 AND name = 'Elf'", [elf.id]),
    ).toBe(1);
  });

  it("validates the name length (1..30)", async () => {
    const long = await sendJson(
      t.app,
      "POST",
      `${ACCOUNTS}/${mainId}/characters`,
      { name: "x".repeat(31) },
      a.cookie,
    );
    expect(long.status).toBe(422);
  });
});
