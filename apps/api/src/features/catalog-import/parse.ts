import { CSV_IMPORT_LIMIT } from "@vaultkeeper/shared/constants";
import {
  csvCatalogRow,
  csvHeaderIssues,
  normalizeCsvHeader,
  type CsvCatalogRow,
  type CsvRowError,
} from "@vaultkeeper/shared/schemas/csv";
import { parse } from "csv-parse/sync";
import { ValidationError } from "../../shared/http/errors";
import type { ValidationFailureDetails } from "../../shared/http/validator";

export interface ParsedCsvRow {
  /** 1-based line number in the file (header = 1), as shown to the admin. */
  row: number;
  data: CsvCatalogRow;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  errors: CsvRowError[];
}

export interface ParseCatalogCsvOptions {
  maxRows?: number;
}

/** A problem with the whole file (encoding, syntax, header, size): nothing can be previewed. */
function fileError(code: string, messages: readonly string[]): ValidationError {
  const details: ValidationFailureDetails = {
    target: "form",
    issues: messages.map((message) => ({ path: ["file"], code, message })),
  };
  return new ValidationError("Invalid CSV file", details);
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    // fatal: invalid sequences throw instead of becoming U+FFFD; a leading BOM is dropped.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw fileError("invalid_encoding", ["The file is not valid UTF-8 text"]);
  }
}

interface RecordWithInfo {
  record: string[];
  info: { lines: number };
}

/**
 * csv-parse counts a stray `\r` as an extra line, so mixed line endings (Excel exports) would shift
 * the reported row numbers: normalize them first (a line break inside a name is invalid anyway).
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function parseRecords(text: string): RecordWithInfo[] {
  try {
    return parse(normalizeLineEndings(text), {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      info: true,
    }) as unknown as RecordWithInfo[];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw fileError("invalid_csv", [`Malformed CSV: ${reason}`]);
  }
}

/**
 * Decodes and parses an admin catalog CSV (design 11). File-level problems throw a 422
 * ValidationError; row-level problems are collected per line so the admin sees all of them.
 * Pure: matching against the database happens in the service.
 */
export function parseCatalogCsv(
  bytes: Uint8Array,
  { maxRows = CSV_IMPORT_LIMIT.MAX_ROWS }: ParseCatalogCsvOptions = {},
): CsvParseResult {
  const [header, ...records] = parseRecords(decodeUtf8(bytes));
  if (!header) throw fileError("missing_header", ["The file has no header row"]);
  const headerIssues = csvHeaderIssues(header.record);
  if (headerIssues.length > 0) throw fileError("invalid_header", headerIssues);
  if (records.length > maxRows) {
    throw fileError("too_many_rows", [
      `The file has ${records.length} rows; at most ${maxRows} are allowed per import`,
    ]);
  }

  const columns = header.record.map(normalizeCsvHeader);
  const rows: ParsedCsvRow[] = [];
  const errors: CsvRowError[] = [];
  for (const { record, info } of records) {
    const row = info.lines;
    if (record.length !== columns.length) {
      errors.push({
        row,
        issues: [{ message: `Expected ${columns.length} cells, found ${record.length}` }],
      });
      continue;
    }
    const cells = Object.fromEntries(columns.map((column, index) => [column, record[index]]));
    const result = csvCatalogRow.safeParse(cells);
    if (result.success) {
      rows.push({ row, data: result.data });
    } else {
      errors.push({
        row,
        issues: result.error.issues.map((issue) => ({
          column: String(issue.path[0]),
          message: issue.message,
        })),
      });
    }
  }
  return { rows, errors };
}
