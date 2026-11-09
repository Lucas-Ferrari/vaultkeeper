import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { apiEnv, repoRoot } from "./env";
import type { NewAccount } from "./pages/register-page";

/** Unique per call: the e2e database is shared and never reset between runs. */
export function generateTestUser(): NewAccount {
  const id = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  return { name: `E2E ${id}`, email: `e2e-${id}@example.com`, password: "e2e-password-123" };
}

/** Runs an operator CLI command (design 08b) against the e2e database; returns stdout. */
export function runCli(...args: string[]): string {
  return execFileSync("pnpm", ["--silent", "--filter", "@vaultkeeper/api", "cli", ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...apiEnv },
    encoding: "utf8",
  });
}
