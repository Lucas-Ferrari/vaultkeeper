import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import { api } from "../../../shared/lib/api";
import { stockKeys, type StockFilters } from "./keys";

export const STOCK_PAGE_SIZE = 50;

/** Only defined, non-empty filters go on the wire. */
function filterQuery(filters: StockFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
}

/** Keyset pages (R-STK-4): `nextCursor` null on the last page. */
export function stockListQueryOptions(filters: StockFilters) {
  return infiniteQueryOptions({
    queryKey: stockKeys.list(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.api.v1.stock.$get({
          query: {
            ...filterQuery(filters),
            limit: String(STOCK_PAGE_SIZE),
            ...(pageParam === undefined ? {} : { cursor: pageParam }),
          },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function stockEntryQueryOptions(id: string) {
  return queryOptions({
    queryKey: stockKeys.detail(id),
    queryFn: () => unwrap(api.api.v1.stock[":id"].$get({ param: { id } })),
  });
}
