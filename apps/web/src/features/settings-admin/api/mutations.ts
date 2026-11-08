import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import type { UpdateSettingsInput } from "@vaultkeeper/shared/schemas/settings";
import { api } from "../../../shared/lib/api";
import { accountKeys } from "../../accounts/api/keys";
import { valuationKeys } from "../../dashboard/api/keys";
import { settingsKeys } from "./keys";

/** Design 13: settings -> settingsKeys.all, valuationKeys.all (MP), accountKeys.all (vaults). */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSettingsInput) =>
      unwrap(api.api.v1.admin.settings.$patch({ json: patch })),
    onSuccess: async (saved) => {
      queryClient.setQueryData(settingsKeys.all, saved);
      await Promise.all(
        [settingsKeys.all, valuationKeys.all, accountKeys.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
