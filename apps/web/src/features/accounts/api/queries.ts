import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import { api } from "../../../shared/lib/api";
import { accountKeys } from "./keys";

export const accountsQueryOptions = queryOptions({
  queryKey: accountKeys.list(),
  queryFn: () => unwrap(api.api.v1["game-accounts"].$get()),
});

export function accountQueryOptions(id: string) {
  return queryOptions({
    queryKey: accountKeys.detail(id),
    queryFn: () => unwrap(api.api.v1["game-accounts"][":id"].$get({ param: { id } })),
  });
}

export function storageQueryOptions(accountId: string) {
  return queryOptions({
    queryKey: accountKeys.storage(accountId),
    queryFn: () =>
      unwrap(api.api.v1["game-accounts"][":id"].storage.$get({ param: { id: accountId } })),
  });
}

export interface LocationChoice {
  id: string;
  /** "<account> · <location>", e.g. "Main · Vault 3". */
  label: string;
  overLimit: boolean;
}

/** Every location of every own account, for location pickers (stock form, move dialog). */
export function useLocationChoices(): { choices: LocationChoice[]; loading: boolean } {
  const accounts = useQuery(accountsQueryOptions);
  const storages = useQueries({
    queries: (accounts.data ?? []).map((account) => storageQueryOptions(account.id)),
  });
  const choices = (accounts.data ?? []).flatMap((account, index) =>
    (storages[index]?.data?.locations ?? []).map((location) => ({
      id: location.id,
      label: `${account.name} · ${location.label}`,
      overLimit: location.overLimit,
    })),
  );
  return { choices, loading: accounts.isPending || storages.some((s) => s.isPending) };
}
