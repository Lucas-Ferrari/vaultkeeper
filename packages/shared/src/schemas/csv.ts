import { z } from "zod";
import { CSV_IMPORT_LIMIT } from "../constants";
import { catalogItemName, categorySlug } from "./catalog";
import { mcAmount } from "./common";

/** CSV column names (design 11). Header names are matched trimmed and case-insensitively. */
export const CSV_COLUMN = {
  CATEGORY: "category",
  NAME: "name",
  REFERENCE_PRICE_MC: "reference_price_mc",
  IS_ACTIVE: "is_active",
  EXTERNAL_KEY: "external_key",
} as const;
export type CsvColumn = (typeof CSV_COLUMN)[keyof typeof CSV_COLUMN];

export const CSV_REQUIRED_COLUMNS: readonly CsvColumn[] = [CSV_COLUMN.CATEGORY, CSV_COLUMN.NAME];
export const CSV_COLUMNS: readonly CsvColumn[] = Object.values(CSV_COLUMN);

const KNOWN_COLUMNS: ReadonlySet<string> = new Set(CSV_COLUMNS);

/** Canonical form of a header cell. */
export function normalizeCsvHeader(header: string): string {
  return header.trim().toLowerCase();
}

/** Problems with a CSV header row (missing required, unknown, duplicate); empty when valid. */
export function csvHeaderIssues(headers: readonly string[]): string[] {
  const names = headers.map(normalizeCsvHeader);
  const issues: string[] = [];
  for (const required of CSV_REQUIRED_COLUMNS) {
    if (!names.includes(required)) issues.push(`Missing required column "${required}"`);
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (!KNOWN_COLUMNS.has(name)) {
      issues.push(`Unknown column "${name}" (allowed: ${CSV_COLUMNS.join(", ")})`);
    } else if (seen.has(name)) {
      issues.push(`Duplicate column "${name}"`);
    }
    seen.add(name);
  }
  return issues;
}

/** An empty optional cell means "not provided" (design 11), never "clear the value". */
function optionalCell<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const externalKey = z.string().max(CSV_IMPORT_LIMIT.EXTERNAL_KEY_MAX, {
  error: `Use at most ${CSV_IMPORT_LIMIT.EXTERNAL_KEY_MAX} characters`,
});

/**
 * One CSV data row (cells already trimmed by the parser), keyed by CSV column name so issue paths
 * name the column. Output uses the API's field names and OMITS optional values not provided.
 */
export const csvCatalogRow = z
  .object({
    [CSV_COLUMN.CATEGORY]: categorySlug,
    [CSV_COLUMN.NAME]: catalogItemName,
    [CSV_COLUMN.REFERENCE_PRICE_MC]: optionalCell(mcAmount),
    [CSV_COLUMN.IS_ACTIVE]: optionalCell(z.stringbool({ error: "Use true/false, yes/no or 1/0" })),
    [CSV_COLUMN.EXTERNAL_KEY]: optionalCell(externalKey),
  })
  .transform((row) => ({
    categorySlug: row.category,
    name: row.name,
    ...(row.reference_price_mc === undefined ? {} : { referencePriceMc: row.reference_price_mc }),
    ...(row.is_active === undefined ? {} : { isActive: row.is_active }),
    ...(row.external_key === undefined ? {} : { externalKey: row.external_key }),
  }));
export type CsvCatalogRow = z.output<typeof csvCatalogRow>;

/** POST /admin/catalog/import?dryRun=. Defaults to a preview: writing needs dryRun=false. */
export const csvImportQuery = z.object({
  dryRun: z.stringbool().default(true),
});
export type CsvImportQuery = z.infer<typeof csvImportQuery>;

export const CSV_ROW_ACTION = {
  CREATE: "create",
  UPDATE: "update",
  UNCHANGED: "unchanged",
} as const;
export type CsvRowAction = (typeof CSV_ROW_ACTION)[keyof typeof CSV_ROW_ACTION];

/** `row` is the 1-based line number in the file (the header is line 1). */
export const csvRowIssue = z.object({
  column: z.string().optional(),
  message: z.string(),
});
export type CsvRowIssue = z.infer<typeof csvRowIssue>;

export const csvRowError = z.object({
  row: z.number().int().min(1),
  issues: z.array(csvRowIssue).min(1),
});
export type CsvRowError = z.infer<typeof csvRowError>;

export const csvRowPlan = z.object({
  row: z.number().int().min(1),
  action: z.enum(CSV_ROW_ACTION),
  categorySlug: z.string(),
  /** The stored name for matched rows (accents kept, R-CAT-5 S5), else the CSV name. */
  name: z.string(),
  itemId: z.uuid().nullable(),
  /** CSV columns whose value changes (update only). */
  changes: z.array(z.enum(CSV_COLUMN)),
});
export type CsvRowPlan = z.infer<typeof csvRowPlan>;

/** Response of the import (dryRun preview or applied). Applied imports never carry errors. */
export const csvImportResult = z.object({
  dryRun: z.boolean(),
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
  unchanged: z.number().int().min(0),
  rows: z.array(csvRowPlan),
  errors: z.array(csvRowError),
});
export type CsvImportResult = z.infer<typeof csvImportResult>;

/** `error.details` of a 422 when an applied import has invalid rows (nothing was written). */
export const csvImportErrorDetails = z.object({
  errors: z.array(csvRowError).min(1),
});
export type CsvImportErrorDetails = z.infer<typeof csvImportErrorDetails>;
