import { MC_TO_MP_RATE_DEFAULT, VAULT_COUNT } from "@vaultkeeper/shared/constants";
import { sql } from "drizzle-orm";
import { boolean, check, numeric, pgTable, smallint, text } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { between, timestamptz } from "./columns";

/**
 * Typed singleton (ADR5, R-SET-1): `id` is always TRUE, so the PK admits exactly one row. The row
 * itself is seeded by migration 0003_settings_seed, so defaults exist on a fresh deployment.
 */
export const appSettings = pgTable(
  "app_settings",
  {
    id: boolean("id").primaryKey().default(true),
    mcToMpRate: numeric("mc_to_mp_rate", { precision: 8, scale: 4, mode: "string" })
      .notNull()
      .default(MC_TO_MP_RATE_DEFAULT),
    vaultCount: smallint("vault_count").notNull().default(VAULT_COUNT.DEFAULT),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    check("app_settings_singleton", sql`${t.id}`),
    check("app_settings_rate_positive", sql`${t.mcToMpRate} > 0`),
    check(
      "app_settings_vault_count_range",
      between(t.vaultCount, VAULT_COUNT.MIN, VAULT_COUNT.MAX),
    ),
  ],
);
