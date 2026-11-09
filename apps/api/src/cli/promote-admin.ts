import { ROLE } from "@vaultkeeper/shared/constants";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { user } from "../db/schema";
import { EXIT, type CliIo, type ExitCode } from "./io";
import { findUserByEmail, noSuchUser, parseEmailArg } from "./users";

export const PROMOTE_ADMIN_USAGE = "promote-admin <email>";

export interface AdminRoleDeps {
  db: Database;
  io: CliIo;
}

/**
 * First-admin bootstrap (R-AUTH-3 S3, design 08b): sign in once, then run this with that email.
 * Idempotent. Takes effect on the user's next request (no session cookie cache).
 */
export async function run(args: readonly string[], { db, io }: AdminRoleDeps): Promise<ExitCode> {
  const email = parseEmailArg(args, PROMOTE_ADMIN_USAGE, io);
  if (email === null) return EXIT.FAILURE;

  const target = await findUserByEmail(db, email);
  if (!target) {
    noSuchUser(io, email);
    return EXIT.FAILURE;
  }
  if (target.role === ROLE.ADMIN) {
    io.out(`${email} is already an admin (unchanged).`);
    return EXIT.OK;
  }

  await db.update(user).set({ role: ROLE.ADMIN }).where(eq(user.id, target.id));
  io.out(`promoted ${email} to admin.`);
  return EXIT.OK;
}
