export const STORAGE_KIND = {
  INVENTORY: "inventory",
  VAULT: "vault",
} as const;
export type StorageKind = (typeof STORAGE_KIND)[keyof typeof STORAGE_KIND];

export const ROLE = {
  USER: "user",
  ADMIN: "admin",
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

export const IMAGE_MIME = {
  PNG: "image/png",
  JPEG: "image/jpeg",
  WEBP: "image/webp",
} as const;
export type ImageMime = (typeof IMAGE_MIME)[keyof typeof IMAGE_MIME];

/** Max item image upload size: 1 MiB. */
export const UPLOAD_MAX_BYTES = 1_048_576;
/** Max admin catalog CSV upload size: 2 MiB. */
export const CSV_MAX_BYTES = 2_097_152;

/** Item level range (+0 .. +15). */
export const LEVEL = {
  MIN: 0,
  MAX: 15,
} as const;
