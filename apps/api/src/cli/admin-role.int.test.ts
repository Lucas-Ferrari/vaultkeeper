import { ROLE } from "@vaultkeeper/shared/constants";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, getWith, signUp, type TestApp } from "../../test/auth-helpers";
import { memoryIo } from "../../test/cli-io";
import { useTestDatabase } from "../../test/db";
import { run as demoteAdmin } from "./demote-admin";
import { EXIT } from "./io";
import { run as promoteAdmin } from "./promote-admin";

/** promote-admin / demote-admin (R-AUTH-3 S3, design 08b): first-admin bootstrap without the UI. */
describe("promote-admin / demote-admin CLIs", () => {
  const db = useTestDatabase();
  let t: TestApp;

  beforeAll(() => {
    t = createTestApp(db.current.url);
  });
  afterAll(async () => {
    await t.close();
  });

  async function roleOf(userId: string): Promise<string | null> {
    const { rows } = await t.database.pool.query<{ role: string | null }>(
      `SELECT role FROM "user" WHERE id = $1`,
      [userId],
    );
    return rows[0]?.role ?? null;
  }

  async function roles(): Promise<Record<string, string | null>> {
    const { rows } = await t.database.pool.query<{ id: string; role: string | null }>(
      `SELECT id, role FROM "user" ORDER BY id`,
    );
    return Object.fromEntries(rows.map((row) => [row.id, row.role]));
  }

  async function adminCount(): Promise<number> {
    const { rows } = await t.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "user" WHERE role = 'admin'`,
    );
    return rows[0]?.n ?? 0;
  }

  async function demoteAllAdmins(): Promise<void> {
    await t.database.pool.query(`UPDATE "user" SET role = 'user' WHERE role = 'admin'`);
  }

  const deps = (io = memoryIo()) => ({ db: t.database.db, io });

  describe("promote-admin", () => {
    it("S3: makes a user who signed in once an admin, effective on their existing session", async () => {
      const signed = await signUp(t.app);
      const io = memoryIo();

      const code = await promoteAdmin([signed.email], deps(io));

      expect(code).toBe(EXIT.OK);
      expect(await roleOf(signed.id)).toBe(ROLE.ADMIN);
      expect(io.stdout.join("\n")).toContain(`promoted ${signed.email} to admin`);
      const me = await getWith(t.app, "/api/v1/me", signed.cookie);
      expect(((await me.json()) as { role: string }).role).toBe(ROLE.ADMIN);
    });

    it("S3: is idempotent: re-running for an admin exits 0 and says 'unchanged'", async () => {
      const signed = await signUp(t.app);
      await promoteAdmin([signed.email], deps());
      const io = memoryIo();

      const code = await promoteAdmin([signed.email], deps(io));

      expect(code).toBe(EXIT.OK);
      expect(io.stdout.join("\n")).toContain("unchanged");
      expect(await roleOf(signed.id)).toBe(ROLE.ADMIN);
    });

    it("matches the email case-insensitively and ignores surrounding spaces", async () => {
      const signed = await signUp(t.app);

      const code = await promoteAdmin([`  ${signed.email.toUpperCase()} `], deps());

      expect(code).toBe(EXIT.OK);
      expect(await roleOf(signed.id)).toBe(ROLE.ADMIN);
    });

    it("S3: unknown email -> exit 1 with an error, and no role changes anywhere", async () => {
      await signUp(t.app);
      const before = await roles();
      const io = memoryIo();

      const code = await promoteAdmin(["nobody@example.com"], deps(io));

      expect(code).toBe(EXIT.FAILURE);
      expect(io.stderr.join("\n")).toContain("No user with email nobody@example.com");
      expect(await roles()).toEqual(before);
    });

    it.each([[[]], [["a@x.com", "b@x.com"]], [["not-an-email"]]])(
      "usage error for args %j -> exit 1, nothing changes",
      async (args) => {
        const before = await roles();
        const io = memoryIo();

        const code = await promoteAdmin(args, deps(io));

        expect(code).toBe(EXIT.FAILURE);
        expect(io.stderr.join("\n")).toMatch(/usage: promote-admin <email>/i);
        expect(await roles()).toEqual(before);
      },
    );
  });

  describe("demote-admin", () => {
    it("demotes an admin back to 'user' while another admin remains", async () => {
      await demoteAllAdmins();
      const keeper = await signUp(t.app);
      const target = await signUp(t.app);
      await promoteAdmin([keeper.email], deps());
      await promoteAdmin([target.email], deps());
      const io = memoryIo();

      const code = await demoteAdmin([target.email], deps(io));

      expect(code).toBe(EXIT.OK);
      expect(await roleOf(target.id)).toBe(ROLE.USER);
      expect(await roleOf(keeper.id)).toBe(ROLE.ADMIN);
      expect(io.stdout.join("\n")).toContain(`demoted ${target.email} to user`);
    });

    it("refuses to demote the last admin: exit 1, still admin", async () => {
      await demoteAllAdmins();
      const last = await signUp(t.app);
      await promoteAdmin([last.email], deps());
      const io = memoryIo();

      const code = await demoteAdmin([last.email], deps(io));

      expect(code).toBe(EXIT.FAILURE);
      expect(io.stderr.join("\n")).toContain("last admin");
      expect(await roleOf(last.id)).toBe(ROLE.ADMIN);
      expect(await adminCount()).toBe(1);
    });

    it("is idempotent: a plain user exits 0 'unchanged'", async () => {
      const plain = await signUp(t.app);
      const io = memoryIo();

      const code = await demoteAdmin([plain.email], deps(io));

      expect(code).toBe(EXIT.OK);
      expect(io.stdout.join("\n")).toContain("unchanged");
      expect(await roleOf(plain.id)).toBe(ROLE.USER);
    });

    it("racing a concurrent demotion of the other admin, it still refuses (admin rows locked)", async () => {
      await demoteAllAdmins();
      const a = await signUp(t.app);
      const b = await signUp(t.app);
      await promoteAdmin([a.email], deps());
      await promoteAdmin([b.email], deps());

      // Another operator's transaction holds the admin rows and is demoting `a`.
      const other = await t.database.pool.connect();
      try {
        await other.query("BEGIN");
        await other.query(`SELECT id FROM "user" WHERE role = 'admin' FOR UPDATE`);
        const pending = demoteAdmin([b.email], deps());
        await new Promise((resolve) => setTimeout(resolve, 200));
        await other.query(`UPDATE "user" SET role = 'user' WHERE id = $1`, [a.id]);
        await other.query("COMMIT");

        // Without the lock it would have counted 2 admins from its snapshot and demoted b too.
        expect(await pending).toBe(EXIT.FAILURE);
      } finally {
        other.release();
      }
      expect(await adminCount()).toBe(1);
      expect(await roleOf(b.id)).toBe(ROLE.ADMIN);
    });

    it("unknown email -> exit 1, nothing changes", async () => {
      const before = await roles();
      const io = memoryIo();

      const code = await demoteAdmin(["ghost@example.com"], deps(io));

      expect(code).toBe(EXIT.FAILURE);
      expect(io.stderr.join("\n")).toContain("No user with email ghost@example.com");
      expect(await roles()).toEqual(before);
    });
  });
});
