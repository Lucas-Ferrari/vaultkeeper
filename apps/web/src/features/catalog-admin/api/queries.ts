import { queryOptions } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import { api } from "../../../shared/lib/api";
import { catalogKeys, type AdminCatalogListParams } from "../../catalog/api/keys";
import { CATALOG_STATUS } from "../lib/search";

export const ADMIN_PAGE_SIZE = 50;

/** Admin list. "all" must send includeInactive=true, else the API lists active items only. */
export function adminCatalogListQueryOptions(params: AdminCatalogListParams) {
  const scope =
    params.status === CATALOG_STATUS.ACTIVE
      ? { active: "true" }
      : params.status === CATALOG_STATUS.INACTIVE
        ? { active: "false" }
        : { includeInactive: "true" };
  return queryOptions({
    queryKey: catalogKeys.adminList(params),
    queryFn: () =>
      unwrap(
        api.api.v1.admin.catalog.items.$get({
          query: {
            ...scope,
            limit: String(ADMIN_PAGE_SIZE),
            ...(params.q === "" ? {} : { q: params.q }),
            ...(params.category === undefined ? {} : { category: params.category }),
          },
        }),
      ),
  });
}

export function adminItemQueryOptions(id: string) {
  return queryOptions({
    queryKey: catalogKeys.item(id),
    queryFn: () => unwrap(api.api.v1.admin.catalog.items[":id"].$get({ param: { id } })),
  });
}
