/**
 * Drizzle schema barrel (design 06): drizzle-kit reads this file, the app and the Better Auth
 * adapter import it. Migrations: `pnpm --filter @vaultkeeper/api db:generate` (custom SQL with
 * `--custom`), verified by `db:check`.
 */
export * from "./auth";
export * from "./catalog";
export * from "./game-accounts";
export * from "./groups";
export * from "./relations";
export * from "./settings";
export * from "./stock";
