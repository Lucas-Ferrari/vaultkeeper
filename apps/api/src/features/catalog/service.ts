import type {
  AdminCatalogSearchQuery,
  CatalogItem,
  CatalogSearchQuery,
  CreateCatalogItemInput,
  CreateCategoryInput,
  ItemCategory,
  UpdateCatalogItemInput,
  UpdateCategoryInput,
} from "@vaultkeeper/shared/schemas/catalog";
import type { Database } from "../../db/client";
import { SEARCH_LIMIT } from "@vaultkeeper/shared/constants";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../shared/http/errors";
import { PG_ERROR, pgCodeOf } from "../../shared/http/on-error";
import { offsetPage, type OffsetPage } from "../../shared/http/pagination";
import type { ValidationFailureDetails } from "../../shared/http/validator";
import type { StorageAdapter } from "../../storage/storage-adapter";
import { deleteImageIfUnused } from "../catalog-images/repository";
import * as catalogRepository from "./repository";

export type CatalogRepository = typeof catalogRepository;

export interface CatalogServiceDeps {
  db: Database;
  /** Item image files: a hard delete drops the item's file once no other item uses it. */
  storage: StorageAdapter;
  repo?: CatalogRepository;
}

/** Same `details` shape as request validation, so clients render one kind of field error. */
function unknownCategory(): ValidationError {
  const details: ValidationFailureDetails = {
    target: "json",
    issues: [{ path: ["categorySlug"], code: "unknown_category", message: "Unknown category" }],
  };
  return new ValidationError("Invalid input", details);
}

/**
 * Translates constraint violations of an item write into client errors: the per-category unique
 * name (R-CAT-1 S2) is a 409, the category FK (only FK on catalog_items) is a 422 field error (S4).
 */
async function mapItemWriteErrors<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    const code = pgCodeOf(error);
    if (code === PG_ERROR.UNIQUE_VIOLATION) {
      throw new ConflictError("An item with this name already exists in this category", {
        field: "name",
      });
    }
    if (code === PG_ERROR.FOREIGN_KEY_VIOLATION) throw unknownCategory();
    throw error;
  }
}

/** Non-space characters needed before fuzzy matching kicks in (R-SRCH-1 S7). */
function isFuzzyQuery(q: string): boolean {
  return q.replace(/\s/g, "").length >= SEARCH_LIMIT.FUZZY_MIN_CHARS;
}

/** Admin list scope (R-CAT-2 S2, R-SRCH-2 S1): `active` wins; else includeInactive lists both. */
function adminActiveFilter(query: AdminCatalogSearchQuery): boolean | undefined {
  if (query.active !== undefined) return query.active;
  return query.includeInactive ? undefined : true;
}

/** Catalog use cases (design 02). Authorization (admin vs user) is enforced by the routers. */
export function createCatalogService({
  db,
  storage,
  repo = catalogRepository,
}: CatalogServiceDeps) {
  /** Fuzzy search for q >= 2 non-space chars, otherwise a name-prefix/category browse (S7). */
  async function findItems(
    query: CatalogSearchQuery,
    active: boolean | undefined,
  ): Promise<OffsetPage<CatalogItem>> {
    const q = query.q ?? "";
    const base = { active, category: query.category, limit: query.limit, offset: query.offset };
    const { items, total } = isFuzzyQuery(q)
      ? await repo.searchItems(db, { ...base, q })
      : await repo.listItems(db, { ...base, prefix: q === "" ? undefined : q });
    return offsetPage(items, total, query);
  }

  return {
    createItem(input: CreateCatalogItemInput): Promise<CatalogItem> {
      return mapItemWriteErrors(repo.insertItem(db, input));
    },

    async updateItem(id: string, patch: UpdateCatalogItemInput): Promise<CatalogItem> {
      const item = await mapItemWriteErrors(repo.updateItem(db, id, patch));
      if (!item) throw new NotFoundError("Catalog item not found");
      return item;
    },

    /** User read (R-AUTH-4 S3): inactive items are invisible, so they 404 like unknown ids. */
    async getActiveItem(id: string): Promise<CatalogItem> {
      const item = await repo.findItem(db, id, { activeOnly: true });
      if (!item) throw new NotFoundError("Catalog item not found");
      return item;
    },

    /** Admin read: any state (admins edit inactive items too). */
    async adminGetItem(id: string): Promise<CatalogItem> {
      const item = await repo.findItem(db, id, { activeOnly: false });
      if (!item) throw new NotFoundError("Catalog item not found");
      return item;
    },

    /**
     * R-CAT-3 S4: only unreferenced items can be deleted; used ones should be deactivated.
     * The item's image file goes too, unless another item shares it (content-addressed).
     */
    async deleteItem(id: string): Promise<void> {
      let deleted: catalogRepository.DeletedItem | null;
      try {
        deleted = await repo.deleteItem(db, id);
      } catch (error) {
        if (pgCodeOf(error) === PG_ERROR.FOREIGN_KEY_VIOLATION) {
          throw new AppError({
            code: ERROR_CODE.REFERENCED,
            status: 409,
            message: "Item is used by stock entries; deactivate it instead",
          });
        }
        throw error;
      }
      if (!deleted) throw new NotFoundError("Catalog item not found");
      if (deleted.imageKey !== null) await deleteImageIfUnused(db, storage, deleted.imageKey);
    },

    /** User search/browse: active items only (R-SRCH-2 S1, R-AUTH-4 S3). */
    listActiveItems(query: CatalogSearchQuery): Promise<OffsetPage<CatalogItem>> {
      return findItems(query, true);
    },

    adminListItems(query: AdminCatalogSearchQuery): Promise<OffsetPage<CatalogItem>> {
      return findItems(query, adminActiveFilter(query));
    },

    async createCategory(input: CreateCategoryInput): Promise<ItemCategory> {
      try {
        return await repo.insertCategory(db, input);
      } catch (error) {
        if (pgCodeOf(error) === PG_ERROR.UNIQUE_VIOLATION) {
          throw new ConflictError("A category with this slug already exists", { field: "slug" });
        }
        throw error;
      }
    },

    async updateCategory(slug: string, patch: UpdateCategoryInput): Promise<ItemCategory> {
      const category = await repo.updateCategory(db, slug, patch);
      if (!category) throw new NotFoundError("Category not found");
      return category;
    },

    listCategories(): Promise<ItemCategory[]> {
      return repo.listCategories(db);
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
