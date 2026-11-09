/** Catalog query keys (design 13), hierarchical so catalogKeys.all invalidates every view. */
export interface CatalogSearchParams {
  q: string;
  category?: string | undefined;
}

export interface AdminCatalogListParams {
  q: string;
  category?: string | undefined;
  /** "all" (includeInactive=true), "active" or "inactive". */
  status: string;
}

export const catalogKeys = {
  all: ["catalog"] as const,
  search: (params: CatalogSearchParams) => [...catalogKeys.all, "search", params] as const,
  item: (id: string) => [...catalogKeys.all, "item", id] as const,
  categories: () => [...catalogKeys.all, "categories"] as const,
  adminList: (params: AdminCatalogListParams) => [...catalogKeys.all, "admin", params] as const,
};
