import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { envSchema } from "./env";

const EXAMPLE_PATH = new URL("../../../../.env.example", import.meta.url);
const COMPOSE_PATH = new URL("../../../../docker-compose.yml", import.meta.url);

const COMPOSE_AND_OPS_KEYS = [
  "DOMAIN",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "IMAGE_TAG",
  "BACKUP_DIR",
  "BACKUP_RETENTION_DAYS",
  "COMPOSE_PROJECT_NAME",
];

/** Keys present in .env.example, commented-out ones (`# KEY=`) included. */
function exampleEntries(): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of readFileSync(EXAMPLE_PATH, "utf8").split("\n")) {
    const match = /^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined) entries.set(match[1], match[2] ?? "");
  }
  return entries;
}

describe(".env.example (task 7.5, R-DEP-1 S3)", () => {
  const entries = exampleEntries();

  it("documents every key of the API env schema", () => {
    const missing = Object.keys(envSchema.shape).filter((key) => !entries.has(key));
    expect(missing).toEqual([]);
  });

  it("documents every compose-only and ops-script key", () => {
    expect(COMPOSE_AND_OPS_KEYS.filter((key) => !entries.has(key))).toEqual([]);
  });

  it("documents every ${VAR} docker-compose.yml interpolates", () => {
    const compose = readFileSync(COMPOSE_PATH, "utf8");
    const vars = new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((m) => m[1] ?? ""));
    expect([...vars].filter((key) => !entries.has(key))).toEqual([]);
  });

  it("holds placeholders only: no OAuth secrets and a non-production auth secret", () => {
    expect(entries.get("GOOGLE_CLIENT_SECRET")).toBe("");
    expect(entries.get("DISCORD_CLIENT_SECRET")).toBe("");
    expect(entries.get("BETTER_AUTH_SECRET")).toMatch(/change-me/);
  });

  it("has no out-of-scope storage or mail keys (R-NG-1)", () => {
    const outOfScope = [...entries.keys()].filter((key) => /^(S3|AWS|MINIO|SMTP|MAIL)/.test(key));
    expect(outOfScope).toEqual([]);
  });
});
