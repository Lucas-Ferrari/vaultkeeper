import { queryOptions } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import { api } from "../../../shared/lib/api";
import { catalogKeys, type CatalogSearchParams } from "./keys";

/** Catalog data changes rarely (design 13: staleTime 60 s). */
export const CATALOG_STALE_TIME_MS = 60_000;
export const PICKER_PAGE_SIZE = 20;

export const categoriesQueryOptions = queryOptions({
  queryKey: catalogKeys.categories(),
  queryFn: () => unwrap(api.api.v1.catalog.categories.$get()),
  staleTime: CATALOG_STALE_TIME_MS,
});

/** User search (active items only, server side). */
export function catalogSearchQueryOptions(params: CatalogSearchParams) {
  return queryOptions({
    queryKey: catalogKeys.search(params),
    queryFn: () =>
      unwrap(
        api.api.v1.catalog.items.$get({
          query: {
            q: params.q,
            limit: String(PICKER_PAGE_SIZE),
            ...(params.category === undefined ? {} : { category: params.category }),
          },
        }),
      ),
    staleTime: CATALOG_STALE_TIME_MS,
  });
}
