import { createAuth } from "../auth/auth";
import { loadEnv } from "../config/env";
import { createDatabase } from "../db/client";
import { createCommands, type CliServices } from "./commands";
import { dispatch } from "./dispatch";
import { processIo } from "./io";

/**
 * Operator CLI entry (design 08b):
 *   dev:  pnpm --filter @vaultkeeper/api cli <command> [args]
 *   prod: docker compose exec api node dist/cli/index.js <command> [args]
 * Env is loaded (and validated) only when a command actually runs.
 */

async function openServices(): Promise<CliServices> {
  const env = loadEnv();
  const database = createDatabase(env.DATABASE_URL);
  return {
    db: database.db,
    auth: createAuth({ db: database.db, env }),
    close: () => database.close(),
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

const commands = createCommands({ open: openServices, io: processIo, readStdin });

dispatch(process.argv.slice(2), commands, processIo).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    processIo.err(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
