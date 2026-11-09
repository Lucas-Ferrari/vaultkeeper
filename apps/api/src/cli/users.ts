import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { user } from "../db/schema";
import type { CliIo } from "./io";

const emailArg = z.email();

/**
 * The single `<email>` positional argument shared by the account CLIs, normalized the way
 * Better Auth stores emails (trimmed, lowercase). Prints `usage` and returns null otherwise.
 */
export function parseEmailArg(
  positionals: readonly string[],
  usage: string,
  io: CliIo,
): string | null {
  const [raw, ...rest] = positionals;
  const email = raw?.trim().toLowerCase();
  if (email === undefined || rest.length > 0 || !emailArg.safeParse(email).success) {
    io.err(`Usage: ${usage}`);
    return null;
  }
  return email;
}

export interface CliUser {
  id: string;
  email: string;
  role: string | null;
}

/** Drizzle or a transaction: both can run the lookup. */
type Queryable = Pick<Database, "select">;

export async function findUserByEmail(db: Queryable, email: string): Promise<CliUser | null> {
  const rows = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export function noSuchUser(io: CliIo, email: string): void {
  io.err(`No user with email ${email}. They must sign in once before an operator can do this.`);
}
