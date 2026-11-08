import { ROLE } from "@vaultkeeper/shared/constants";
import { eq } from "drizzle-orm";
import { user } from "../db/schema";
import { EXIT, type ExitCode } from "./io";
import type { AdminRoleDeps } from "./promote-admin";
import { findUserByEmail, noSuchUser, parseEmailArg } from "./users";

export const DEMOTE_ADMIN_USAGE = "demote-admin <email>";

const OUTCOME = {
  NO_USER: "no-user",
  UNCHANGED: "unchanged",
  LAST_ADMIN: "last-admin",
  DEMOTED: "demoted",
} as const;
type Outcome = (typeof OUTCOME)[keyof typeof OUTCOME];

/**
 * Reverses promote-admin (design 08b). Refuses to demote the last admin, so the instance never
 * ends up without anyone able to manage the catalog and settings. Admin rows are locked
 * (SELECT ... FOR UPDATE) so two concurrent demotes cannot both pass the "another admin remains"
 * check.
 */
export async function run(args: readonly string[], { db, io }: AdminRoleDeps): Promise<ExitCode> {
  const email = parseEmailArg(args, DEMOTE_ADMIN_USAGE, io);
  if (email === null) return EXIT.FAILURE;

  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    const admins = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, ROLE.ADMIN))
      .for("update");
    const target = await findUserByEmail(tx, email);
    if (!target) return OUTCOME.NO_USER;
    if (target.role !== ROLE.ADMIN) return OUTCOME.UNCHANGED;
    if (admins.length <= 1) return OUTCOME.LAST_ADMIN;
    await tx.update(user).set({ role: ROLE.USER }).where(eq(user.id, target.id));
    return OUTCOME.DEMOTED;
  });

  switch (outcome) {
    case OUTCOME.NO_USER:
      noSuchUser(io, email);
      return EXIT.FAILURE;
    case OUTCOME.UNCHANGED:
      io.out(`${email} is not an admin (unchanged).`);
      return EXIT.OK;
    case OUTCOME.LAST_ADMIN:
      io.err(`Refusing to demote ${email}: they are the last admin. Promote someone else first.`);
      return EXIT.FAILURE;
    case OUTCOME.DEMOTED:
      io.out(`demoted ${email} to user.`);
      return EXIT.OK;
  }
}
