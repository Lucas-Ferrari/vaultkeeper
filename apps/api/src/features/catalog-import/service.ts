import { CSV_MAX_BYTES } from "@vaultkeeper/shared/constants";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import { normalizeMc } from "@vaultkeeper/shared/money";
import {
  CSV_COLUMN,
  CSV_ROW_ACTION,
  type CsvColumn,
  type CsvImportErrorDetails,
  type CsvImportResult,
  type CsvRowError,
  type CsvRowIssue,
  type CsvRowPlan,
} from "@vaultkeeper/shared/schemas/csv";
import type { Database, DbOrTx } from "../../db/client";
import { AppError, ValidationError } from "../../shared/http/errors";
import { parseCatalogCsv, type ParsedCsvRow } from "./parse";
import * as importRepository from "./repository";
import type { ItemUpdate, NewCsvItem } from "./repository";

export interface CatalogImportServiceDeps {
  db: Database;
  /** CSV_MAX_BYTES (design 15). */
  maxBytes?: number;
  repo?: typeof importRepository;
}

export interface UploadedCsv {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface Plan {
  rows: CsvRowPlan[];
  errors: CsvRowError[];
  inserts: NewCsvItem[];
  updates: ItemUpdate[];
}

const keyOf = (slug: string, folded: string) => `${slug}\u0000${folded}`;

function count(rows: readonly CsvRowPlan[], action: CsvRowPlan["action"]): number {
  return rows.filter((row) => row.action === action).length;
}

/**
 * Admin CSV import (R-CAT-5, design 11): validate everything first, then apply all rows in ONE
 * transaction or nothing. Matches by (category, case/accent-folded name); never renames.
 */
export function createCatalogImportService({
  db,
  maxBytes = CSV_MAX_BYTES,
  repo = importRepository,
}: CatalogImportServiceDeps) {
  async function plan(
    tx: DbOrTx,
    parsed: ParsedCsvRow[],
    parseErrors: CsvRowError[],
    lock: boolean,
  ): Promise<Plan> {
    const categories = await repo.listCategorySlugs(tx);
    const folded = await repo.foldNames(
      tx,
      parsed.map((r) => r.data.name),
    );
    const keys = parsed.map((r, i) => ({
      categorySlug: r.data.categorySlug,
      searchName: folded[i] ?? "",
    }));
    const existing = new Map(
      (await repo.findByKeys(tx, keys, lock)).map((item) => [
        keyOf(item.categorySlug, item.searchName),
        item,
      ]),
    );
    const extKeys = parsed.flatMap((r) => (r.data.externalKey ? [r.data.externalKey] : []));
    const extOwners = await repo.findExternalKeyOwners(tx, extKeys);

    const result: Plan = { rows: [], errors: [...parseErrors], inserts: [], updates: [] };
    const seenKeys = new Map<string, number>();
    const seenExt = new Map<string, number>();

    parsed.forEach(({ row, data }, index) => {
      const issues: CsvRowIssue[] = [];
      const key = keyOf(data.categorySlug, keys[index]?.searchName ?? "");
      const match = existing.get(key);
      if (!categories.has(data.categorySlug)) {
        issues.push({
          column: CSV_COLUMN.CATEGORY,
          message: `Unknown category "${data.categorySlug}"`,
        });
      }
      const firstRow = seenKeys.get(key);
      if (firstRow === undefined) seenKeys.set(key, row);
      else issues.push({ column: CSV_COLUMN.NAME, message: `Duplicate of row ${firstRow}` });

      const ext = data.externalKey;
      if (ext !== undefined) {
        const firstExt = seenExt.get(ext);
        const owner = extOwners.get(ext);
        if (firstExt !== undefined) {
          issues.push({
            column: CSV_COLUMN.EXTERNAL_KEY,
            message: `Duplicate external_key of row ${firstExt}`,
          });
        } else if (match?.externalKey && match.externalKey !== ext) {
          issues.push({
            column: CSV_COLUMN.EXTERNAL_KEY,
            message: `Does not match the item's external_key "${match.externalKey}"`,
          });
        } else if (owner !== undefined && owner !== match?.id) {
          issues.push({ column: CSV_COLUMN.EXTERNAL_KEY, message: "Already used by another item" });
        }
        seenExt.set(ext, firstExt ?? row);
      }
      if (issues.length > 0) {
        result.errors.push({ row, issues });
        return;
      }

      if (!match) {
        result.inserts.push({
          categorySlug: data.categorySlug,
          name: data.name,
          referencePriceMc: data.referencePriceMc ?? null,
          isActive: data.isActive ?? true,
          externalKey: ext ?? null,
        });
        result.rows.push({
          row,
          action: CSV_ROW_ACTION.CREATE,
          categorySlug: data.categorySlug,
          name: data.name,
          itemId: null,
          changes: [],
        });
        return;
      }

      const changes: CsvColumn[] = [];
      const price =
        data.referencePriceMc === undefined
          ? match.referencePriceMc
          : normalizeMc(data.referencePriceMc);
      if (price !== match.referencePriceMc) changes.push(CSV_COLUMN.REFERENCE_PRICE_MC);
      const isActive = data.isActive ?? match.isActive;
      if (isActive !== match.isActive) changes.push(CSV_COLUMN.IS_ACTIVE);
      const externalKey = match.externalKey ?? ext ?? null;
      if (externalKey !== match.externalKey) changes.push(CSV_COLUMN.EXTERNAL_KEY);
      if (changes.length > 0) {
        result.updates.push({ id: match.id, referencePriceMc: price, isActive, externalKey });
      }
      result.rows.push({
        row,
        action: changes.length > 0 ? CSV_ROW_ACTION.UPDATE : CSV_ROW_ACTION.UNCHANGED,
        categorySlug: match.categorySlug,
        name: match.name,
        itemId: match.id,
        changes,
      });
    });
    result.errors.sort((a, b) => a.row - b.row);
    return result;
  }

  function summary(p: Plan, dryRun: boolean): CsvImportResult {
    return {
      dryRun,
      created: count(p.rows, CSV_ROW_ACTION.CREATE),
      updated: count(p.rows, CSV_ROW_ACTION.UPDATE),
      unchanged: count(p.rows, CSV_ROW_ACTION.UNCHANGED),
      rows: p.rows,
      errors: p.errors,
    };
  }

  return {
    async importCsv(file: UploadedCsv, { dryRun }: { dryRun: boolean }): Promise<CsvImportResult> {
      if (file.size > maxBytes) {
        throw new AppError({
          code: ERROR_CODE.PAYLOAD_TOO_LARGE,
          status: 413,
          message: `CSV file exceeds ${maxBytes} bytes`,
        });
      }
      const { rows, errors } = parseCatalogCsv(new Uint8Array(await file.arrayBuffer()));
      if (dryRun) return summary(await plan(db, rows, errors, false), true);

      return db.transaction(async (tx) => {
        const p = await plan(tx, rows, errors, true);
        if (p.errors.length > 0) {
          const details: CsvImportErrorDetails = { errors: p.errors };
          throw new ValidationError("The CSV has invalid rows; nothing was imported", details);
        }
        await repo.insertItems(tx, p.inserts);
        await repo.updateItems(tx, p.updates);
        return summary(p, false);
      });
    },
  };
}

export type CatalogImportService = ReturnType<typeof createCatalogImportService>;
