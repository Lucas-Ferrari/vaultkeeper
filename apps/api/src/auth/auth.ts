import { AUTH_LIMIT, ROLE } from "@vaultkeeper/shared/constants";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { NODE_ENV, type Env } from "../config/env";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { blockLinkIntoUnverifiedCredentialUser } from "./linking-guard";

const DAY_SECONDS = 60 * 60 * 24;

export const AUTH_BASE_PATH = "/api/auth";
export const AUTH_COOKIE_PREFIX = "vk";
export const MIN_PASSWORD_LENGTH = 10;
/** OAuth providers that may link to each other on the same email (design 08). */
export const OAUTH_PROVIDERS = ["google", "discord"] as const;

export type AuthEnv = Pick<
  Env,
  | "NODE_ENV"
  | "PUBLIC_URL"
  | "EXTRA_TRUSTED_ORIGINS"
  | "BETTER_AUTH_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "DISCORD_CLIENT_ID"
  | "DISCORD_CLIENT_SECRET"
>;

export interface CreateAuthOptions {
  db: Database;
  env: AuthEnv;
  /**
   * Better Auth rate limiting (database storage). ON unless a caller explicitly passes false:
   * only the in-process test harness does, because its requests carry no client IP and would all
   * share one bucket.
   */
  rateLimit?: boolean;
}

function socialProviders(env: AuthEnv): NonNullable<BetterAuthOptions["socialProviders"]> {
  return {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
      ? { discord: { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET } }
      : {}),
  };
}

/**
 * Better Auth instance (design 08 rev 3). No email senders: no SMTP in the MVP (Q2), so no
 * verification or reset mails; passwords are reset by the operator CLI (08b).
 */
export function createAuth({ db, env, rateLimit = true }: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL: env.PUBLIC_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_URL, ...env.EXTRA_TRUSTED_ORIGINS],
    telemetry: { enabled: false },
    logger: { disabled: env.NODE_ENV === NODE_ENV.TEST },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: AUTH_LIMIT.PASSWORD_MIN,
      maxPasswordLength: AUTH_LIMIT.PASSWORD_MAX,
      requireEmailVerification: false,
    },
    socialProviders: socialProviders(env),
    account: {
      // R-AUTH-7 (spike 2.1). Google <-> Discord may link on the same email. Linking INTO an
      // unverified password user is refused twice: Better Auth's requireLocalEmailVerified gate
      // (default true; deliberately NOT set: the option is deprecated) and the hook below.
      accountLinking: { enabled: true, trustedProviders: [...OAUTH_PROVIDERS] },
    },
    databaseHooks: {
      account: { create: { before: blockLinkIntoUnverifiedCredentialUser } },
    },
    plugins: [
      admin({
        defaultRole: ROLE.USER,
        adminRoles: [ROLE.ADMIN],
        // set-role & co. are authorized by THIS access-control map (has-permission.mjs), not by
        // adminRoles (only read for "impersonate admins"). Explicit so the gate is visible here.
        roles: { [ROLE.ADMIN]: adminAc, [ROLE.USER]: userAc },
      }),
    ],
    advanced: {
      useSecureCookies: env.NODE_ENV === NODE_ENV.PRODUCTION,
      cookiePrefix: AUTH_COOKIE_PREFIX,
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    rateLimit: { enabled: rateLimit, storage: "database" },
    session: {
      expiresIn: 30 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
      // DISABLED on purpose (architecture/auth-session-cache): a cached session_data cookie keeps
      // a revoked session alive until maxAge, breaking reset-password logout (R-AUTH-6 S1).
      cookieCache: { enabled: false },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"]["session"];
export type AuthUser = Auth["$Infer"]["Session"]["user"];
