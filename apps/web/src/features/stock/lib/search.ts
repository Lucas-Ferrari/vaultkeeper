import { z } from "zod";

/** Search params of /stock (R-STK-4). Bad values fall back to "no filter", never throw. */
export const stockSearch = z.object({
  q: z.string().optional().catch(undefined),
  accountId: z.uuid().optional().catch(undefined),
  locationId: z.uuid().optional().catch(undefined),
  groupId: z.uuid().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
});
export type StockSearch = z.infer<typeof stockSearch>;
