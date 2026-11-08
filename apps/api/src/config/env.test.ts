import { CSV_MAX_BYTES, UPLOAD_MAX_BYTES } from "@vaultkeeper/shared/constants";
import { describe, expect, it } from "vitest";
import { configuredOAuthProviders, DEFAULT_MEDIA_DIR, type EnvSource, parseEnv } from "./env";

const SECRET_32 = "x".repeat(32);

const base: EnvSource = {
  PUBLIC_URL: "http://localhost:5173",
  DATABASE_URL: "postgres://vaultkeeper:vaultkeeper@localhost:5432/vaultkeeper",
  BETTER_AUTH_SECRET: SECRET_32,
};

function issuePaths(source: EnvSource): string[] {
  const result = parseEnv(source);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("parseEnv", () => {
  it("accepts the minimal config and applies defaults", () => {
    const result = parseEnv(base);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      MEDIA_DIR: DEFAULT_MEDIA_DIR,
      UPLOAD_MAX_BYTES,
      CSV_MAX_BYTES,
      LOG_LEVEL: "info",
      EXTRA_TRUSTED_ORIGINS: [],
    });
    expect(configuredOAuthProviders(result.data)).toEqual([]);
  });

  it("defaults MEDIA_DIR to /data/media and honours an override", () => {
    const withDefault = parseEnv(base);
    const overridden = parseEnv({ ...base, MEDIA_DIR: "./.data/media" });
    expect(withDefault.success && withDefault.data.MEDIA_DIR).toBe("/data/media");
    expect(overridden.success && overridden.data.MEDIA_DIR).toBe("./.data/media");
  });

  it("treats blank values as unset", () => {
    const result = parseEnv({ ...base, MEDIA_DIR: "", GOOGLE_CLIENT_ID: "", PORT: " " });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.MEDIA_DIR).toBe(DEFAULT_MEDIA_DIR);
    expect(result.data.PORT).toBe(3000);
    expect(result.data.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("coerces PORT and parses EXTRA_TRUSTED_ORIGINS as a csv of URLs", () => {
    const result = parseEnv({
      ...base,
      PORT: "4000",
      EXTRA_TRUSTED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.PORT).toBe(4000);
    expect(result.data.EXTRA_TRUSTED_ORIGINS).toEqual([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
  });

  it("rejects a non-URL trusted origin", () => {
    expect(issuePaths({ ...base, EXTRA_TRUSTED_ORIGINS: "not a url" })).toContain(
      "EXTRA_TRUSTED_ORIGINS.0",
    );
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 chars", () => {
    expect(issuePaths({ ...base, BETTER_AUTH_SECRET: "x".repeat(31) })).toEqual([
      "BETTER_AUTH_SECRET",
    ]);
  });

  it("requires PUBLIC_URL, DATABASE_URL and BETTER_AUTH_SECRET", () => {
    expect(issuePaths({}).sort()).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL", "PUBLIC_URL"]);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(issuePaths({ ...base, DATABASE_URL: "mysql://localhost/db" })).toEqual(["DATABASE_URL"]);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(issuePaths({ ...base, NODE_ENV: "staging" })).toEqual(["NODE_ENV"]);
  });

  it.each([
    ["GOOGLE", { GOOGLE_CLIENT_ID: "id" }],
    ["GOOGLE", { GOOGLE_CLIENT_SECRET: "secret" }],
    ["DISCORD", { DISCORD_CLIENT_ID: "id" }],
    ["DISCORD", { DISCORD_CLIENT_SECRET: "secret" }],
  ])("rejects a half-configured %s OAuth pair (%o)", (provider, partial) => {
    expect(issuePaths({ ...base, ...partial })).toEqual([`${provider}_CLIENT_SECRET`]);
  });

  it("accepts complete OAuth pairs and reports the configured providers", () => {
    const result = parseEnv({
      ...base,
      GOOGLE_CLIENT_ID: "gid",
      GOOGLE_CLIENT_SECRET: "gsecret",
      DISCORD_CLIENT_ID: "did",
      DISCORD_CLIENT_SECRET: "dsecret",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(configuredOAuthProviders(result.data)).toEqual(["google", "discord"]);
  });
});
