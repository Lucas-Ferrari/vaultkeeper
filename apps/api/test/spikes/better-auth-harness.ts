import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/db/schema";
import {
  cookieHeader,
  OAUTH_BASE_URL,
  oauthServer,
  PROVIDER,
  signInWithProvider,
  type FakeIdentity,
  type OAuthResult,
  type Provider,
} from "../fake-oauth";

/**
 * Throwaway Better Auth harness for the phase 2 spikes (tasks 2.1/2.2). Seeds 2.13-2.16:
 * a real Better Auth instance (drizzleAdapter over a pg Pool, like the app) on the per-file test
 * database. The fake Google/Discord providers now live in test/fake-oauth.ts (shared with 2.14).
 */

export const BASE_URL = OAUTH_BASE_URL;
const SECRET = "spike-secret-spike-secret-spike-secret-0123";

export { cookieHeader, oauthServer, PROVIDER, signInWithProvider };
export type { FakeIdentity, OAuthResult, Provider };

// ---------------------------------------------------------------------------------------------
// Better Auth instance
// ---------------------------------------------------------------------------------------------

/** Options close to design 08 (no admin plugin / rate limit: irrelevant to the spikes). */
export function spikeAuthOptions(pool: Pool, overrides: Partial<BetterAuthOptions> = {}) {
  return {
    database: drizzleAdapter(drizzle({ client: pool, schema }), { provider: "pg", schema }),
    baseURL: BASE_URL,
    basePath: "/api/auth",
    secret: SECRET,
    trustedOrigins: [BASE_URL],
    telemetry: { enabled: false },
    logger: { disabled: true },
    emailAndPassword: { enabled: true, minPasswordLength: 10, requireEmailVerification: false },
    socialProviders: {
      google: { clientId: "google-client-id", clientSecret: "google-client-secret" },
      discord: { clientId: "discord-client-id", clientSecret: "discord-client-secret" },
    },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    ...overrides,
  } satisfies BetterAuthOptions;
}

export function createSpikeAuth(pool: Pool, overrides: Partial<BetterAuthOptions> = {}) {
  return betterAuth(spikeAuthOptions(pool, overrides));
}

export type SpikeAuth = ReturnType<typeof createSpikeAuth>;

// ---------------------------------------------------------------------------------------------
// HTTP drivers (in-process through auth.handler, like the Hono app will do)
// ---------------------------------------------------------------------------------------------

function jsonRequest(path: string, body: unknown, cookie?: string): Request {
  const headers = new Headers({ "content-type": "application/json", origin: BASE_URL });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${BASE_URL}/api/auth${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export interface EmailCredentials {
  email: string;
  password: string;
}

export interface EmailSignUp extends EmailCredentials {
  name: string;
}

export interface GetSessionOptions {
  /** Skip the signed session_data cookie and read the session from the database. */
  disableCookieCache?: boolean;
}

export async function signUpEmail(auth: SpikeAuth, input: EmailSignUp): Promise<Response> {
  return auth.handler(jsonRequest("/sign-up/email", input));
}

export async function signInEmail(auth: SpikeAuth, input: EmailCredentials): Promise<Response> {
  return auth.handler(jsonRequest("/sign-in/email", input));
}

export async function getSession(
  auth: SpikeAuth,
  cookie: string,
  options: GetSessionOptions = {},
): Promise<unknown> {
  const query = options.disableCookieCache ? "?disableCookieCache=true" : "";
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth/get-session${query}`, { headers: { cookie } }),
  );
  return response.json();
}

// ---------------------------------------------------------------------------------------------
// Raw DB reads for assertions
// ---------------------------------------------------------------------------------------------

export async function providersOf(pool: Pool, email: string): Promise<string[]> {
  const result = await pool.query<{ providerId: string }>(
    `SELECT a.provider_id AS "providerId" FROM account a JOIN "user" u ON u.id = a.user_id
     WHERE u.email = $1 ORDER BY a.provider_id`,
    [email],
  );
  return result.rows.map((row) => row.providerId);
}

export async function countAccounts(pool: Pool, providerId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*) FROM account WHERE provider_id = $1`,
    [providerId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export { Pool };
