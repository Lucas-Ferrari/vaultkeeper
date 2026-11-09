import { z } from "zod";
import { VAULT_COUNT } from "../constants";
import { RATE_PATTERN } from "../money";

/** MC -> MP rate as an exact decimal STRING > 0 (R-SET-1 S2, numeric(8,4)). */
export const mcToMpRate = z
  .string()
  .regex(RATE_PATTERN, { error: "Must be a decimal with at most 4 digits and 4 decimals" })
  .refine((value) => /[1-9]/.test(value), { error: "Must be greater than 0" });

/** Global vaults per game account (R-SET-1 S3): integer 1..50. */
export const vaultCount = z
  .number({ error: "Must be a whole number" })
  .int({ error: "Must be a whole number" })
  .min(VAULT_COUNT.MIN, { error: `Use at least ${VAULT_COUNT.MIN}` })
  .max(VAULT_COUNT.MAX, { error: `Use at most ${VAULT_COUNT.MAX}` });

/** GET /settings (R-SET-2): readable by any signed-in user. */
export const settings = z.object({
  mcToMpRate: z.string(),
  vaultCount: z.number().int(),
  updatedAt: z.iso.datetime(),
  updatedBy: z.string().nullable(),
});
export type Settings = z.infer<typeof settings>;

/** PATCH /admin/settings: any subset, at least one field. */
export const updateSettingsInput = z
  .object({ mcToMpRate, vaultCount })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { error: "Change at least one setting" });
export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;
