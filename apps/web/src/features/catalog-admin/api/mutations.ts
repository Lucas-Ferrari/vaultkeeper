import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@vaultkeeper/api-client";
import type { CatalogItem, UpdateCatalogItemInput } from "@vaultkeeper/shared/schemas/catalog";
import { api } from "../../../shared/lib/api";
import { catalogKeys } from "../../catalog/api/keys";
import { valuationKeys } from "../../dashboard/api/keys";

/** Catalog price/active edits change valuations too (design 13 invalidation map). */
function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  return async (item?: CatalogItem) => {
    if (item) queryClient.setQueryData(catalogKeys.item(item.id), item);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
      queryClient.invalidateQueries({ queryKey: valuationKeys.all }),
    ]);
  };
}

export function useUpdateItem(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (patch: UpdateCatalogItemInput) =>
      unwrap(api.api.v1.admin.catalog.items[":id"].$patch({ param: { id }, json: patch })),
    onSuccess: invalidate,
  });
}

export function useDeleteItem(id: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: () => unwrap(api.api.v1.admin.catalog.items[":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: catalogKeys.item(id) });
      await invalidate();
    },
  });
}

export function useUploadImage(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (file: File) =>
      unwrap(api.api.v1.admin.catalog.items[":id"].image.$put({ param: { id }, form: { file } })),
    onSuccess: invalidate,
  });
}

export function useRemoveImage(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: () =>
      unwrap(api.api.v1.admin.catalog.items[":id"].image.$delete({ param: { id } })),
    onSuccess: invalidate,
  });
}

export interface ImportCsvInput {
  file: File;
  dryRun: boolean;
}

export function useImportCsv() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ file, dryRun }: ImportCsvInput) =>
      unwrap(
        api.api.v1.admin.catalog.import.$post({
          query: { dryRun: String(dryRun) },
          form: { file },
        }),
      ),
    onSuccess: async (result) => {
      if (!result.dryRun) await invalidate();
    },
  });
}
