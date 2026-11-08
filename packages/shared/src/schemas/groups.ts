import { z } from "zod";
import { TEXT_LIMIT } from "../constants";
import { stockEntry } from "./stock";
import { valuationTotals } from "./valuation";

/** Max entry ids per membership request (one transaction). */
export const GROUP_ENTRIES_MAX = 500;

const groupName = z
  .string()
  .trim()
  .min(1, { error: "Name is required" })
  .max(TEXT_LIMIT.GROUP_NAME, { error: `Use at most ${TEXT_LIMIT.GROUP_NAME} characters` });
const groupDescription = z
  .string()
  .max(TEXT_LIMIT.GROUP_DESCRIPTION, {
    error: `Use at most ${TEXT_LIMIT.GROUP_DESCRIPTION} characters`,
  })
  .nullable();

/** POST /groups (R-GRP-1): name unique per user, case-insensitive (409). */
export const createGroupInput = z.object({
  name: groupName,
  description: groupDescription.optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupInput>;

export const updateGroupInput = z
  .object({ name: groupName, description: groupDescription })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { error: "Change at least one field" });
export type UpdateGroupInput = z.infer<typeof updateGroupInput>;

const entryIds = z.array(z.uuid()).max(GROUP_ENTRIES_MAX);

/** POST /groups/:id/entries: adds (idempotent); all-or-nothing when any id is not owned (S7). */
export const addGroupEntriesInput = z.object({ stockEntryIds: entryIds.min(1) });
export type AddGroupEntriesInput = z.infer<typeof addGroupEntriesInput>;

/** PUT /groups/:id/entries: replaces the whole membership set (may be empty). */
export const replaceGroupEntriesInput = z.object({ stockEntryIds: entryIds });
export type ReplaceGroupEntriesInput = z.infer<typeof replaceGroupEntriesInput>;

/** A group with its entry count and totals (R-GRP-1 S1, R-VAL-3). */
export const stockGroup = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  entryCount: z.number().int(),
  totals: valuationTotals,
});
export type StockGroup = z.infer<typeof stockGroup>;

/** GET /groups/:id (R-GRP-3): members with their current location and value. */
export const stockGroupDetail = stockGroup.extend({ entries: z.array(stockEntry) });
export type StockGroupDetail = z.infer<typeof stockGroupDetail>;
