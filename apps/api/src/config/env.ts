import { CSV_MAX_BYTES, UPLOAD_MAX_BYTES } from "@vaultkeeper/shared/constants";
import { z } from "zod";

export const NODE_ENV = {
  DEVELOPMENT: "development",
  TEST: "test",
  PRODUCTION: "production",
} as const;

export const LOG_LEVEL = {
  FATAL: "fatal",
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug",
  TRACE: "trace",
} as const;

export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;
export const DEFAULT_MEDIA_DIR = "/data/media";

const optionalText = z.string().trim().min(1).optional();

const csvList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(z.array(z.url()));

/** Both values of an OAuth credential pair must be set, or neither. */
function oauthPairComplete(id: string | undefined, secret: string | undefined): boolean {
  return (id === undefined) === (secret === undefined);
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENV).default(NODE_ENV.DEVELOPMENT),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    PUBLIC_URL: z.url(),
    EXTRA_TRUSTED_ORIGINS: csvList,
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    BETTER_AUTH_SECRET: z.string().min(BETTER_AUTH_SECRET_MIN_LENGTH, {
      error: `BETTER_AUTH_SECRET must be at least ${BETTER_AUTH_SECRET_MIN_LENGTH} characters`,
    }),
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    DISCORD_CLIENT_ID: optionalText,
    DISCORD_CLIENT_SECRET: optionalText,
    MEDIA_DIR: z.string().trim().min(1).default(DEFAULT_MEDIA_DIR),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(UPLOAD_MAX_BYTES),
    CSV_MAX_BYTES: z.coerce.number().int().positive().default(CSV_MAX_BYTES),
    LOG_LEVEL: z.enum(LOG_LEVEL).default(LOG_LEVEL.INFO),
  })
  .superRefine((env, ctx) => {
    if (!oauthPairComplete(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message:
          "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together (or both left unset)",
      });
    }
    if (!oauthPairComplete(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["DISCORD_CLIENT_SECRET"],
        message:
          "DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be set together (or both left unset)",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** `.env` files commonly leave keys blank (`FOO=`); treat blank as unset. */
function dropBlank(source: EnvSource): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== "") cleaned[key] = value;
  }
  return cleaned;
}

export function parseEnv(source: EnvSource): z.ZodSafeParseResult<Env> {
  return envSchema.safeParse(dropBlank(source));
}

export function configuredOAuthProviders(env: Env): string[] {
  const providers: string[] = [];
  if (env.GOOGLE_CLIENT_ID !== undefined) providers.push("google");
  if (env.DISCORD_CLIENT_ID !== undefined) providers.push("discord");
  return providers;
}

/** Boot-time loader: exits the process on invalid configuration (design 15). */
export function loadEnv(source: EnvSource = process.env): Env {
  const result = parseEnv(source);
  if (!result.success) {
    console.error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  if (configuredOAuthProviders(result.data).length === 0) {
    console.warn(
      "No OAuth provider configured (Google/Discord): only email/password sign-in will be available.",
    );
  }
  return result.data;
}
