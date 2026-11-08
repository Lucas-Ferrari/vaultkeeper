/** Stock query keys (design 13). */
export interface StockFilters {
  q?: string | undefined;
  accountId?: string | undefined;
  locationId?: string | undefined;
  groupId?: string | undefined;
  category?: string | undefined;
}

export const stockKeys = {
  all: ["stock"] as const,
  list: (filters: StockFilters) => [...stockKeys.all, "list", filters] as const,
  detail: (id: string) => [...stockKeys.all, "detail", id] as const,
};
