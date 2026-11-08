import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import type {
  CreateCharacterInput,
  CreateGameAccountInput,
} from "@vaultkeeper/shared/schemas/game-accounts";
import { api } from "../../../shared/lib/api";
import { valuationKeys } from "../../dashboard/api/keys";
import { accountKeys } from "./keys";

function useInvalidateAccounts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: accountKeys.all });
}

export function useCreateAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (input: CreateGameAccountInput) =>
      unwrap(api.api.v1["game-accounts"].$post({ json: input })),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.api.v1["game-accounts"][":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: accountKeys.detail(id) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
        queryClient.invalidateQueries({ queryKey: valuationKeys.all }),
      ]);
    },
  });
}

export function useCreateCharacter(accountId: string) {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (input: CreateCharacterInput) =>
      unwrap(
        api.api.v1["game-accounts"][":id"].characters.$post({
          param: { id: accountId },
          json: input,
        }),
      ),
    onSuccess: invalidate,
  });
}
