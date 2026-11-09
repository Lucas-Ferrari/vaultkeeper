import { z } from "zod";
import { LEVEL } from "../constants";
import { MC_AMOUNT_PATTERN } from "../money";

/**
 * Exact, non-negative MC amount as a decimal STRING (ADR3: numeric(14,2) in Postgres, strings on
 * the wire so JS floats never touch money). Up to 12 integer digits and 2 decimals.
 */
export const mcAmount = z.string().regex(MC_AMOUNT_PATTERN, {
  error: "Must be a non-negative amount with at most 12 digits and 2 decimals",
});
export type McAmount = z.infer<typeof mcAmount>;

/** Item enhancement level (+0..+15). */
export const itemLevel = z.number().int().min(LEVEL.MIN).max(LEVEL.MAX);
export type ItemLevel = z.infer<typeof itemLevel>;
