import { createHash } from "node:crypto";
import { UPLOAD_MAX_BYTES } from "@vaultkeeper/shared/constants";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import type { CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import type { Database } from "../../db/client";
import { AppError, NotFoundError } from "../../shared/http/errors";
import { sniffImage } from "../../storage/image-sniff";
import { IMAGE_EXTENSION, type StorageAdapter } from "../../storage/storage-adapter";
import * as imageRepository from "./repository";

export type CatalogImageRepository = typeof imageRepository;

export interface CatalogImageServiceDeps {
  db: Database;
  storage: StorageAdapter;
  repo?: CatalogImageRepository;
  /** Largest accepted file (R-CAT-6: 1 MiB). */
  maxBytes?: number;
}

/** The uploaded file as the route hands it over (a web File/Blob). */
export interface UploadedFile {
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function rejected(message: string): AppError {
  return new AppError({ code: ERROR_CODE.UPLOAD_REJECTED, status: 422, message });
}

function itemNotFound(): NotFoundError {
  return new NotFoundError("Catalog item not found");
}

/**
 * Item images (R-CAT-6, design 09): admin-only (enforced by the router), stored through the
 * StorageAdapter under a content hash, so identical bytes share one file.
 */
export function createCatalogImageService({
  db,
  storage,
  repo = imageRepository,
  maxBytes = UPLOAD_MAX_BYTES,
}: CatalogImageServiceDeps) {
  /** Deletes a stored file once no item references it any more. */
  function deleteIfUnused(key: string): Promise<void> {
    return repo.deleteImageIfUnused(db, storage, key);
  }

  /** Swaps the item's key in one locked transaction, then drops the previous file if orphaned. */
  async function replaceKey(id: string, key: string | null): Promise<CatalogItem | null> {
    const swapped = await db.transaction(async (tx) => {
      const current = await repo.lockImageKey(tx, id);
      if (!current) return null;
      const item = await repo.setImageKey(tx, id, key);
      return item && { item, previous: current.imageKey };
    });
    if (!swapped) return null;
    if (swapped.previous !== null && swapped.previous !== key) {
      await deleteIfUnused(swapped.previous);
    }
    return swapped.item;
  }

  return {
    /**
     * Validates size, then the REAL type (an empty file has no magic bytes, so it is rejected too) from the magic bytes, which must also be what the client
     * declared (S2: 413 over the limit, 422 UPLOAD_REJECTED otherwise), then stores and links it.
     */
    async upload(id: string, file: UploadedFile): Promise<CatalogItem> {
      if (file.size > maxBytes) {
        throw new AppError({
          code: ERROR_CODE.PAYLOAD_TOO_LARGE,
          status: 413,
          message: `Image exceeds ${maxBytes} bytes`,
        });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = sniffImage(bytes);
      if (!detected) throw rejected("Only png, jpeg or webp images are accepted");
      if (detected !== file.type) {
        throw rejected(`The file is ${detected}, but was sent as ${file.type || "no type"}`);
      }
      if (!(await repo.itemExists(db, id))) throw itemNotFound();

      const key = `catalog/${createHash("sha256").update(bytes).digest("hex")}.${IMAGE_EXTENSION[detected]}`;
      await storage.put(key, bytes, detected);
      const item = await replaceKey(id, key);
      if (!item) {
        // The item was deleted between the check and the update: do not leave the file behind.
        await deleteIfUnused(key);
        throw itemNotFound();
      }
      return item;
    },

    /** Clears the item's image (idempotent) and deletes the file if nothing else uses it. */
    async remove(id: string): Promise<CatalogItem> {
      const item = await replaceKey(id, null);
      if (!item) throw itemNotFound();
      return item;
    },
  };
}

export type CatalogImageService = ReturnType<typeof createCatalogImageService>;
