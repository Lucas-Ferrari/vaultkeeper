import type { PaginationQuery } from "@vaultkeeper/shared/schemas/pagination";

/** Offset page (catalog search, design 02). Keyset paging for stock lands with phase 4. */
export interface OffsetPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function offsetPage<T>(items: T[], total: number, query: PaginationQuery): OffsetPage<T> {
  return {
    items,
    total,
    limit: query.limit,
    offset: query.offset,
    hasMore: query.offset + items.length < total,
  };
}
