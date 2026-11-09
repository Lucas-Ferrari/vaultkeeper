import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const API_PORT = 3000;
export const WEB_PORT = 5173;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
/** `vite preview` of the production bundle: the only place a service worker exists (task 6.5). */
export const PREVIEW_PORT = 4173;
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

/**
 * API env for e2e (the dev API server and the operator CLI share it); real env vars win so a
 * developer can point at another database.
 */
export const apiEnv: Record<string, string> = {
  NODE_ENV: "test",
  PORT: String(API_PORT),
  PUBLIC_URL: WEB_URL,
  EXTRA_TRUSTED_ORIGINS: `${WEB_URL},${PREVIEW_URL}`,
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://vaultkeeper:vaultkeeper@localhost:5432/vaultkeeper",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-not-for-production-use",
  MEDIA_DIR: process.env.MEDIA_DIR ?? `${repoRoot}.data/e2e-media`,
};
