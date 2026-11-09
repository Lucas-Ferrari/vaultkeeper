import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import type { CreateGroupInput } from "@vaultkeeper/shared/schemas/groups";
import { api } from "../../../shared/lib/api";
import { valuationKeys } from "../../dashboard/api/keys";
import { groupKeys } from "./keys";

/** Design 13: group edits -> groupKeys.all + valuationKeys.group. */
function useInvalidateGroups() {
  const queryClient = useQueryClient();
  return (groupId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupKeys.all }),
      queryClient.invalidateQueries({
        queryKey: groupId === undefined ? valuationKeys.all : valuationKeys.group(groupId),
      }),
    ]);
}

export function useCreateGroup() {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => unwrap(api.api.v1.groups.$post({ json: input })),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteGroup(id: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: () => unwrap(api.api.v1.groups[":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: groupKeys.detail(id) });
      await invalidate(id);
    },
  });
}

export interface AddToGroupInput {
  groupId: string;
  stockEntryIds: string[];
}

export function useAddToGroup() {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: ({ groupId, stockEntryIds }: AddToGroupInput) =>
      unwrap(
        api.api.v1.groups[":id"].entries.$post({ param: { id: groupId }, json: { stockEntryIds } }),
      ),
    onSuccess: (_data, { groupId }) => invalidate(groupId),
  });
}

export function useRemoveFromGroup(groupId: string) {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: (entryId: string) =>
      unwrap(
        api.api.v1.groups[":id"].entries[":entryId"].$delete({ param: { id: groupId, entryId } }),
      ),
    onSuccess: () => invalidate(groupId),
  });
}
