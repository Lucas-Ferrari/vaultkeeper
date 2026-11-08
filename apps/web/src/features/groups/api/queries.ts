import { queryOptions } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import { api } from "../../../shared/lib/api";
import { groupKeys } from "./keys";

export const groupsQueryOptions = queryOptions({
  queryKey: groupKeys.list(),
  queryFn: () => unwrap(api.api.v1.groups.$get()),
});

export function groupQueryOptions(id: string) {
  return queryOptions({
    queryKey: groupKeys.detail(id),
    queryFn: () => unwrap(api.api.v1.groups[":id"].$get({ param: { id } })),
  });
}
