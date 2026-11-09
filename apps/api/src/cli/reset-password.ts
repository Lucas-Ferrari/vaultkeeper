import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import type { Auth } from "../auth/auth";
import { EXIT, type CliIo, type ExitCode } from "./io";
import { noSuchUser, parseEmailArg } from "./users";

export const RESET_PASSWORD_USAGE = "reset-password <email> [--password-stdin]";
/** base64url of 15 random bytes = 20 chars, ~120 bits. */
export const GENERATED_PASSWORD_LENGTH = 20;
const GENERATED_PASSWORD_BYTES = 15;

export interface ResetPasswordDeps {
  auth: Auth;
  io: CliIo;
  /** Whole stdin as text; only read with --password-stdin. */
  readStdin: () => Promise<string>;
}

interface ParsedArgs {
  email: string;
  passwordFromStdin: boolean;
}

function parse(args: readonly string[], io: CliIo): ParsedArgs | null {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: { "password-stdin": { type: "boolean", default: false } },
      allowPositionals: true,
      strict: true,
    });
  } catch {
    io.err(`Usage: ${RESET_PASSWORD_USAGE}`);
    return null;
  }
  const email = parseEmailArg(parsed.positionals, RESET_PASSWORD_USAGE, io);
  if (email === null) return null;
  return { email, passwordFromStdin: parsed.values["password-stdin"] };
}

/** `echo pw | cli` and here-strings end with a newline that is not part of the password. */
function stripTrailingNewline(text: string): string {
  return text.replace(/\r?\n$/, "");
}

/**
 * Operator password reset (R-AUTH-6, design 08b): the ONLY reset path in the MVP (no SMTP).
 * Uses Better Auth's own primitives (spike 2.2): its hasher, its credential-account update and its
 * session deletion, so every existing session of the user is revoked immediately (no cookie cache).
 * A generated password is printed once, alone, on stdout; a --password-stdin one is never echoed.
 */
export async function run(
  args: readonly string[],
  { auth, io, readStdin }: ResetPasswordDeps,
): Promise<ExitCode> {
  const parsed = parse(args, io);
  if (parsed === null) return EXIT.FAILURE;
  const { email, passwordFromStdin } = parsed;

  const ctx = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;

  let password: string;
  if (passwordFromStdin) {
    password = stripTrailingNewline(await readStdin());
    if (password.length < minPasswordLength || password.length > maxPasswordLength) {
      io.err(`The password must be ${minPasswordLength}-${maxPasswordLength} characters.`);
      return EXIT.FAILURE;
    }
  } else {
    password = randomBytes(GENERATED_PASSWORD_BYTES).toString("base64url");
  }

  const found = await ctx.internalAdapter.findUserByEmail(email);
  if (!found) {
    noSuchUser(io, email);
    return EXIT.FAILURE;
  }
  const userId = found.user.id;
  if (!(await ctx.internalAdapter.findCredentialAccount(userId))) {
    io.err(
      `${email} has no password: they sign in with Google or Discord. ` +
        "Ask them to use that provider; nothing was changed.",
    );
    return EXIT.FAILURE;
  }

  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(userId);

  io.err(`Password reset for ${email}; all of their sessions were signed out.`);
  if (!passwordFromStdin) {
    io.err("New password (shown once, share it privately):");
    io.out(password);
  }
  return EXIT.OK;
}
