import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import type {
  CreateStockEntryInput,
  UpdateStockEntryInput,
} from "@vaultkeeper/shared/schemas/stock";
import { api } from "../../../shared/lib/api";
import { accountKeys } from "../../accounts/api/keys";
import { valuationKeys } from "../../dashboard/api/keys";
import { groupKeys } from "../../groups/api/keys";
import { stockKeys } from "./keys";

/**
 * Design 13 invalidation map: every stock write (create/update/move/delete) touches lists, storage
 * entry counts, group contents and valuations.
 */
function useInvalidateStock() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [stockKeys.all, accountKeys.storageAll(), groupKeys.all, valuationKeys.all].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateEntry() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: CreateStockEntryInput) => unwrap(api.api.v1.stock.$post({ json: input })),
    onSuccess: invalidate,
  });
}

export function useUpdateEntry(id: string) {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (patch: UpdateStockEntryInput) =>
      unwrap(api.api.v1.stock[":id"].$patch({ param: { id }, json: patch })),
    onSuccess: invalidate,
  });
}

export interface MoveEntryInput {
  id: string;
  storageLocationId: string;
}

export function useMoveEntry() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({ id, storageLocationId }: MoveEntryInput) =>
      unwrap(api.api.v1.stock[":id"].move.$post({ param: { id }, json: { storageLocationId } })),
    onSuccess: invalidate,
  });
}

export function useDeleteEntry() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.api.v1.stock[":id"].$delete({ param: { id } })),
    onSuccess: invalidate,
  });
}
