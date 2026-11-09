import { queryOptions } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import { api } from "../../../shared/lib/api";
import { valuationKeys } from "./keys";

export function valuationSummaryQueryOptions(accountId?: string) {
  return queryOptions({
    queryKey: valuationKeys.summary(accountId),
    queryFn: () =>
      unwrap(
        api.api.v1.valuation.summary.$get({
          query: accountId === undefined ? {} : { accountId },
        }),
      ),
  });
}
