import type { Auth } from "../auth/auth";
import type { Database } from "../db/client";
import { run as demoteAdmin, DEMOTE_ADMIN_USAGE } from "./demote-admin";
import type { CommandTable } from "./dispatch";
import type { CliIo, ExitCode } from "./io";
import { run as promoteAdmin, PROMOTE_ADMIN_USAGE } from "./promote-admin";
import { run as resetPassword, RESET_PASSWORD_USAGE } from "./reset-password";

/** What the account commands need; opened per run so `cli --help` never touches the database. */
export interface CliServices {
  db: Database;
  auth: Auth;
  close(): Promise<void>;
}

export interface CommandsDeps {
  open: () => Promise<CliServices>;
  io: CliIo;
  readStdin: () => Promise<string>;
}

/** The operator command table (design 08b). */
export function createCommands({ open, io, readStdin }: CommandsDeps): CommandTable {
  const withServices =
    (body: (args: readonly string[], services: CliServices) => Promise<ExitCode>) =>
    async (args: readonly string[]): Promise<ExitCode> => {
      const services = await open();
      try {
        return await body(args, services);
      } finally {
        await services.close();
      }
    };

  return {
    "promote-admin": {
      usage: PROMOTE_ADMIN_USAGE,
      summary: "Make a user who signed in once an admin (first-admin bootstrap). Idempotent.",
      run: withServices((args, { db }) => promoteAdmin(args, { db, io })),
    },
    "demote-admin": {
      usage: DEMOTE_ADMIN_USAGE,
      summary: "Make an admin a regular user again. Refuses to demote the last admin.",
      run: withServices((args, { db }) => demoteAdmin(args, { db, io })),
    },
    "reset-password": {
      usage: RESET_PASSWORD_USAGE,
      summary:
        "Set a new password (printed once, or read from stdin) and sign the user out everywhere.",
      run: withServices((args, { auth }) => resetPassword(args, { auth, io, readStdin })),
    },
  };
}
