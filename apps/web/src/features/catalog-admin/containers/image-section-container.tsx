import { IMAGE_MIME, UPLOAD_MAX_BYTES } from "@vaultkeeper/shared/constants";
import type { CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import { useId } from "react";
import { Alert } from "../../../shared/ui/alert";
import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";
import { ItemImage } from "../../../shared/ui/item-image";
import { useRemoveImage, useUploadImage } from "../api/mutations";
import { imageErrorMessage } from "../lib/messages";

const MAX_LABEL = `${UPLOAD_MAX_BYTES / (1024 * 1024)} MB`;
const ACCEPT = Object.values(IMAGE_MIME).join(",");

interface ImageSectionContainerProps {
  item: CatalogItem;
  categoryIcon: string;
}

/**
 * Item image (R-CAT-6): upload through the API (type checked server side by magic bytes), shows
 * the stored image or the category placeholder, explains 413/422 rejections.
 */
export function ImageSectionContainer({ item, categoryIcon }: ImageSectionContainerProps) {
  const inputId = useId();
  const upload = useUploadImage(item.id);
  const remove = useRemoveImage(item.id);
  const error = upload.error ?? remove.error;
  const busy = upload.isPending || remove.isPending;

  return (
    <section aria-labelledby={`${inputId}-title`} className="flex flex-col gap-3">
      <h2 id={`${inputId}-title`} className="text-lg font-semibold">
        Image
      </h2>
      <div className="flex flex-wrap items-center gap-4">
        <ItemImage
          imageKey={item.imageKey}
          name={item.name}
          categoryIcon={categoryIcon}
          className="size-24"
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-medium">
            Upload image
          </label>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                remove.reset();
                upload.mutate(file);
              }
            }}
            className="min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-border file:bg-surface-raised file:px-3 file:text-foreground"
          />
          <p className="text-xs text-muted">png, jpeg or webp, up to {MAX_LABEL}.</p>
          {item.imageKey !== null && (
            <Button
              variant={BUTTON_VARIANT.GHOST}
              className="self-start"
              requiresNetwork
              disabled={busy}
              onClick={() => {
                upload.reset();
                remove.mutate();
              }}
            >
              Remove image
            </Button>
          )}
        </div>
      </div>
      {upload.isPending && <p className="text-sm text-muted">Uploading…</p>}
      {error && <Alert>{imageErrorMessage(error, MAX_LABEL)}</Alert>}
    </section>
  );
}
