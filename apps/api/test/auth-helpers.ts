import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROLE } from "@vaultkeeper/shared/constants";
import { eq } from "drizzle-orm";
import { createApp, type App } from "../src/app";
import { createAuth, type Auth, type CreateAuthOptions } from "../src/auth/auth";
import { createDatabase, type DatabaseHandle } from "../src/db/client";
import { user } from "../src/db/schema";
import { createLocalDiskAdapter } from "../src/storage/local-disk-adapter";
import type { StorageAdapter } from "../src/storage/storage-adapter";
import { cookieHeader } from "./fake-oauth";
import { TEST_PUBLIC_URL, testEnv, userInput, type UserInput } from "./factories";

export interface TestApp {
  app: App;
  auth: Auth;
  database: DatabaseHandle;
  /** MEDIA_DIR of this app: a fresh temp dir per test app, removed by close(). */
  mediaDir: string;
  storage: StorageAdapter;
  close(): Promise<void>;
}

export interface TestAppOptions {
  env?: Record<string, string>;
  auth?: Partial<Omit<CreateAuthOptions, "db" | "env">>;
}

/**
 * The real app wired like server.ts, on this test file's database. Rate limiting is OFF by default
 * (in-process requests carry no client IP, so every test would share one 3-per-10s bucket).
 */
export function createTestApp(databaseUrl: string, options: TestAppOptions = {}): TestApp {
  const env = testEnv(databaseUrl, options.env);
  const database = createDatabase(env.DATABASE_URL);
  const auth = createAuth({ db: database.db, env, rateLimit: false, ...options.auth });
  const mediaDir = mkdtempSync(join(tmpdir(), "vk-media-"));
  const storage = createLocalDiskAdapter(mediaDir);
  const app = createApp({
    auth,
    db: database.db,
    storage,
    limits: { uploadMaxBytes: env.UPLOAD_MAX_BYTES, csvMaxBytes: env.CSV_MAX_BYTES },
    log: () => {},
    onUnexpectedError: () => {},
  });
  return {
    app,
    auth,
    database,
    mediaDir,
    storage,
    close: async () => {
      await database.close();
      await rm(mediaDir, { recursive: true, force: true });
    },
  };
}

export { cookieHeader };

export function authPost(app: App, path: string, body: unknown, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json", origin: TEST_PUBLIC_URL });
  if (cookie) headers.set("cookie", cookie);
  return app.request(`${TEST_PUBLIC_URL}/api/auth${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** GET with a session cookie (or none). */
export function getWith(app: App, path: string, cookie?: string) {
  return app.request(`${TEST_PUBLIC_URL}${path}`, cookie ? { headers: { cookie } } : {});
}

/** JSON request to the app (POST/PATCH/PUT/DELETE) with an optional session cookie. */
export function sendJson(
  app: App,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  cookie?: string,
) {
  const headers = new Headers({ origin: TEST_PUBLIC_URL });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return app.request(`${TEST_PUBLIC_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export interface SignedInUser {
  id: string;
  email: string;
  password: string;
  cookie: string;
}

interface AuthUserBody {
  user: { id: string; email: string };
}

/** Email sign-up through Better Auth; returns the session cookie. Throws if it did not succeed. */
export async function signUp(app: App, input: Partial<UserInput> = {}): Promise<SignedInUser> {
  const data = userInput(input);
  const response = await authPost(app, "/sign-up/email", data);
  if (response.status !== 200) {
    throw new Error(`sign-up failed (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as AuthUserBody;
  return {
    id: body.user.id,
    email: data.email,
    password: data.password,
    cookie: cookieHeader(response),
  };
}

export function signIn(app: App, email: string, password: string) {
  return authPost(app, "/sign-in/email", { email, password });
}

/** Test shortcut for the promote-admin CLI (2.15): sets role directly in the database. */
export async function promoteAdmin(database: DatabaseHandle, userId: string): Promise<void> {
  await database.db.update(user).set({ role: ROLE.ADMIN }).where(eq(user.id, userId));
}

/** Signs up a user and promotes it to admin. */
export async function signUpAdmin(
  testApp: TestApp,
  input: Partial<UserInput> = {},
): Promise<SignedInUser> {
  const admin = await signUp(testApp.app, input);
  await promoteAdmin(testApp.database, admin.id);
  return admin;
}
