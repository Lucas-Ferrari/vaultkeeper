import { queryOptions } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import { api } from "../../../shared/lib/api";
import { settingsKeys } from "./keys";

export const settingsQueryOptions = queryOptions({
  queryKey: settingsKeys.all,
  queryFn: () => unwrap(api.api.v1.settings.$get()),
  staleTime: 60_000,
});
