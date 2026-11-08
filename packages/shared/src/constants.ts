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

/** Where a catalog item came from (seed, admin UI, CSV import). */
export const CATALOG_SOURCE = {
  OPENMU: "openmu",
  ADMIN: "admin",
  CSV: "csv",
} as const;
export type CatalogSource = (typeof CATALOG_SOURCE)[keyof typeof CATALOG_SOURCE];

/** Catalog category slug: lowercase letters, digits and dashes. */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Max text lengths (chars). Spec lengths win over design (tasks index): account 50, character 30,
 * entry notes 500. Names are also at least 1 char.
 */
export const TEXT_LIMIT = {
  CATALOG_ITEM_NAME: 120,
  GAME_ACCOUNT_NAME: 50,
  CHARACTER_NAME: 30,
  GROUP_NAME: 60,
  GROUP_DESCRIPTION: 500,
  ENTRY_OPTIONS: 500,
  ENTRY_NOTES: 500,
} as const;

/** Catalog category limits (admin-curated; slug is the PK and never edited). */
export const CATEGORY_LIMIT = {
  SLUG_MAX: 40,
  NAME_MAX: 60,
  ICON_MAX: 40,
  SORT_ORDER_MAX: 10_000,
} as const;

/**
 * Catalog search (R-SRCH-1): q is at most 80 chars; below 2 non-space chars the API browses by
 * name prefix/category instead of fuzzy matching (S7: never a full-table dump, limit applies).
 */
export const SEARCH_LIMIT = {
  QUERY_MAX: 80,
  FUZZY_MIN_CHARS: 2,
} as const;

/** Stock entry quantity range. */
export const QUANTITY = {
  MIN: 1,
  MAX: 9999,
} as const;

/** Global number of vaults per game account (settings.vault_count). */
export const VAULT_COUNT = {
  MIN: 1,
  MAX: 50,
  DEFAULT: 10,
} as const;

/** Default MC -> MP conversion rate (exact decimal string, numeric(8,4) in the DB). */
export const MC_TO_MP_RATE_DEFAULT = "7.5";

/**
 * Email/password account limits (design 08). The API passes PASSWORD_MIN/MAX to Better Auth and
 * the web forms validate with the same numbers (schemas/auth).
 */
export const AUTH_LIMIT = {
  PASSWORD_MIN: 10,
  PASSWORD_MAX: 128,
  NAME_MAX: 60,
} as const;

/**
 * `?error=` values Better Auth puts on the OAuth error redirect when it refuses to link an
 * OAuth identity into an unverified email/password user (R-AUTH-7). The web maps both to
 * "sign in with your password".
 */
export const OAUTH_LINK_ERROR = {
  /** Better Auth's own implicit-link gate (requireLocalEmailVerified, on by default). */
  ACCOUNT_NOT_LINKED: "account_not_linked",
  /** Our databaseHooks.account.create.before guard (second layer). */
  LINK_REQUIRES_PASSWORD_SIGN_IN: "LINK_REQUIRES_PASSWORD_SIGN_IN",
} as const;
export type OAuthLinkError = (typeof OAUTH_LINK_ERROR)[keyof typeof OAUTH_LINK_ERROR];
