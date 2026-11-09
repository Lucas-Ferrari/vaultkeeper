import { z } from "zod";

export const CATALOG_STATUS = {
  ALL: "all",
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type CatalogStatus = (typeof CATALOG_STATUS)[keyof typeof CATALOG_STATUS];

/** Search params of /catalog (admin). Bad values fall back to defaults, never throw. */
export const adminCatalogSearch = z.object({
  q: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  status: z.enum(CATALOG_STATUS).optional().catch(undefined),
});
export type AdminCatalogSearch = z.infer<typeof adminCatalogSearch>;
