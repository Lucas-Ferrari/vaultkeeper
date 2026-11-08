import { tmpdir } from "node:os";
import { join } from "node:path";
import { ERROR_CODE, type ApiErrorBody } from "@vaultkeeper/shared/errors";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, getWith, type TestApp } from "../test/auth-helpers";
import { useTestDatabase } from "../test/db";
import { testEnv } from "../test/factories";
import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { createDatabase, type DatabaseHandle } from "./db/client";
import { JSON_BODY_LIMIT_BYTES } from "./shared/http/body-limit";
import { createLocalDiskAdapter } from "./storage/local-disk-adapter";

describe("createApp", () => {
  const db = useTestDatabase();
  let t: TestApp;

  beforeAll(() => {
    t = createTestApp(db.current.url);
  });
  afterAll(async () => {
    await t.close();
  });

  it("R-DEP-3 S1: GET /healthz is 200 with a reachable database, without a session", async () => {
    const res = await getWith(t.app, "/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("unknown routes respond 404 with the error envelope", async () => {
    const res = await getWith(t.app, "/nope");
    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.NOT_FOUND);
  });

  it("every response carries a request id and secure headers", async () => {
    const res = await getWith(t.app, "/healthz");
    expect(res.headers.get("x-request-id")).toMatch(/.+/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("JSON bodies over the API limit get 413 PAYLOAD_TOO_LARGE before any handler", async () => {
    const res = await t.app.request("/api/v1/anything", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blob: "x".repeat(JSON_BODY_LIMIT_BYTES) }),
    });
    expect(res.status).toBe(413);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(ERROR_CODE.PAYLOAD_TOO_LARGE);
  });
});

describe("GET /healthz with the database down (R-DEP-3 S1)", () => {
  let unreachable: DatabaseHandle;

  beforeAll(() => {
    // Port 1 on loopback: connection refused immediately, no timeout wait.
    unreachable = createDatabase("postgres://vk:vk@127.0.0.1:1/none");
  });
  afterAll(async () => {
    await unreachable.close();
  });

  it("responds 503 with status 'unavailable' and no error detail", async () => {
    const env = testEnv("postgres://vk:vk@127.0.0.1:1/none");
    const app = createApp({
      auth: createAuth({ db: unreachable.db, env, rateLimit: false }),
      db: unreachable.db,
      // Never written to: /healthz does not touch storage.
      storage: createLocalDiskAdapter(join(tmpdir(), "vk-unused-media")),
      log: () => {},
      onUnexpectedError: () => {},
    });

    const res = await app.request("/healthz");

    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: "unavailable" });
    expect(text).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);
  });
});
