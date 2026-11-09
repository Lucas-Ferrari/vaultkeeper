import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import type {
  CreateStockEntryInput,
  StockEntry,
  StockListQuery,
  StockPage,
  UpdateStockEntryInput,
} from "@vaultkeeper/shared/schemas/stock";
import { z } from "zod";
import type { Database, DbOrTx } from "../../db/client";
import { AppError, NotFoundError, ValidationError } from "../../shared/http/errors";
import type { ValidationFailureDetails } from "../../shared/http/validator";
import * as stockRepository from "./repository";

export type StockRepository = typeof stockRepository;

export interface StockServiceDeps {
  db: Database;
  repo?: StockRepository;
}

function fieldError(field: string, code: string, message: string): ValidationError {
  const details: ValidationFailureDetails = {
    target: field === "cursor" ? "query" : "json",
    issues: [{ path: [field], code, message }],
  };
  return new ValidationError("Invalid input", details);
}

const itemInactive = () =>
  new AppError({
    code: ERROR_CODE.ITEM_INACTIVE,
    status: 422,
    message: "This item is no longer active in the catalog",
  });

const vaultOverLimit = () =>
  new AppError({
    code: ERROR_CODE.VAULT_OVER_LIMIT,
    status: 422,
    message: "This vault is over the vault limit; move items out of it instead",
  });

/** Opaque keyset cursor: base64url of [created_at text, id]. */
const cursorShape = z.tuple([z.string().min(1).max(64), z.uuid()]);

export function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify([at, id])).toString("base64url");
}

export function decodeCursor(cursor: string): { at: string; id: string } {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const [at, id] = cursorShape.parse(raw);
    if (Number.isNaN(Date.parse(at))) throw new Error("bad timestamp");
    return { at, id };
  } catch {
    throw fieldError("cursor", "invalid_cursor", "Invalid cursor");
  }
}

/** Stock entries use cases (design 02/06, flow d19). Every call is scoped to userId. */
export function createStockService({ db, repo = stockRepository }: StockServiceDeps) {
  /** R-STK-1 S6 / R-AUTH-5 S3: unknown or foreign -> 404. Over-limit vaults take nothing new. */
  async function requireWritableLocation(tx: DbOrTx, userId: string, id: string): Promise<void> {
    const location = await repo.findOwnLocation(tx, userId, id);
    if (!location) throw new NotFoundError("Storage location not found");
    if (location.overLimit) throw vaultOverLimit();
  }

  /** R-CAT-3 S2: new references only to active items. */
  async function requireActiveItem(tx: DbOrTx, id: string): Promise<void> {
    const item = await repo.findItemState(tx, id);
    if (!item) throw fieldError("catalogItemId", "unknown_item", "Unknown catalog item");
    if (!item.isActive) throw itemInactive();
  }

  async function read(tx: DbOrTx, userId: string, id: string): Promise<StockEntry> {
    const entry = await repo.findEntry(tx, userId, id);
    if (!entry) throw new NotFoundError("Stock entry not found");
    return entry;
  }

  return {
    create(userId: string, input: CreateStockEntryInput): Promise<StockEntry> {
      return db.transaction(async (tx) => {
        await requireWritableLocation(tx, userId, input.storageLocationId);
        await requireActiveItem(tx, input.catalogItemId);
        const id = await repo.insertEntry(tx, userId, input);
        return read(tx, userId, id);
      });
    },

    get(userId: string, id: string): Promise<StockEntry> {
      return read(db, userId, id);
    },

    /** R-STK-2: any field; changing the item requires an active one (same item may stay). */
    update(userId: string, id: string, patch: UpdateStockEntryInput): Promise<StockEntry> {
      return db.transaction(async (tx) => {
        const current = await repo.findEntryItem(tx, userId, id);
        if (!current) throw new NotFoundError("Stock entry not found");
        if (patch.catalogItemId !== undefined && patch.catalogItemId !== current.catalogItemId) {
          await requireActiveItem(tx, patch.catalogItemId);
        }
        await repo.updateEntry(tx, userId, id, patch);
        return read(tx, userId, id);
      });
    },

    /** R-STK-2 S1/S2: any own location not over limit; moving OUT of an over-limit vault is fine. */
    move(userId: string, id: string, storageLocationId: string): Promise<StockEntry> {
      return db.transaction(async (tx) => {
        const current = await repo.findEntryItem(tx, userId, id);
        if (!current) throw new NotFoundError("Stock entry not found");
        await requireWritableLocation(tx, userId, storageLocationId);
        await repo.updateEntry(tx, userId, id, { storageLocationId });
        await repo.deleteVaultIfEmptyOverLimit(tx, userId, current.storageLocationId);
        return read(tx, userId, id);
      });
    },

    /** R-STK-3; emptying an over-limit vault removes it in the same transaction (R-GA-5). */
    remove(userId: string, id: string): Promise<void> {
      return db.transaction(async (tx) => {
        const current = await repo.findEntryItem(tx, userId, id);
        if (!current || !(await repo.deleteEntry(tx, userId, id))) {
          throw new NotFoundError("Stock entry not found");
        }
        await repo.deleteVaultIfEmptyOverLimit(tx, userId, current.storageLocationId);
      });
    },

    async list(userId: string, query: StockListQuery): Promise<StockPage> {
      const { cursor, ...filters } = query;
      const rows = await repo.listEntries(db, userId, {
        ...filters,
        after: cursor === undefined ? undefined : decodeCursor(cursor),
      });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => row.entry),
        nextCursor:
          rows.length > query.limit && last ? encodeCursor(last.cursorAt, last.entry.id) : null,
      };
    },
  };
}

export type StockService = ReturnType<typeof createStockService>;
