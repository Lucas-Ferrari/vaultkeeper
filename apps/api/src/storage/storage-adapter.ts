import { IMAGE_MIME, type ImageMime } from "@vaultkeeper/shared/constants";

/** A stored file as read back from an adapter (design 09). */
export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType: ImageMime;
}

/**
 * Storage port (ADR17): catalog code only sees this. LocalDiskAdapter backs it in the MVP; an S3
 * adapter can replace it later if it passes test/storage-adapter.contract.ts.
 * Keys are relative paths like `catalog/<sha256>.png` and content-addressed: putting an existing
 * key is a no-op. Keys that escape the storage root are rejected (throw).
 */
export interface StorageAdapter {
  put(key: string, data: Uint8Array, contentType: ImageMime): Promise<void>;
  /** null when the key does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Idempotent: deleting a missing key succeeds. */
  delete(key: string): Promise<void>;
}

/** File extension used in keys for each allowed image type (jpeg is stored as `.jpg`). */
export const IMAGE_EXTENSION = {
  [IMAGE_MIME.PNG]: "png",
  [IMAGE_MIME.JPEG]: "jpg",
  [IMAGE_MIME.WEBP]: "webp",
} as const satisfies Record<ImageMime, string>;
export type ImageExtension = (typeof IMAGE_EXTENSION)[keyof typeof IMAGE_EXTENSION];

const MIME_BY_EXTENSION: Readonly<Record<ImageExtension, ImageMime>> = {
  png: IMAGE_MIME.PNG,
  jpg: IMAGE_MIME.JPEG,
  webp: IMAGE_MIME.WEBP,
};

function isImageExtension(value: string): value is ImageExtension {
  return Object.hasOwn(MIME_BY_EXTENSION, value);
}

/** Content type implied by a key's extension; null for anything that is not an allowed image. */
export function contentTypeOfKey(key: string): ImageMime | null {
  const extension = key.slice(key.lastIndexOf(".") + 1);
  return key.includes(".") && isImageExtension(extension) ? MIME_BY_EXTENSION[extension] : null;
}
