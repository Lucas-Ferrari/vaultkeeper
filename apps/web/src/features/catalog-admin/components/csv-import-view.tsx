import type { CsvImportResult } from "@vaultkeeper/shared/schemas/csv";
import { useId } from "react";
import { Alert } from "../../../shared/ui/alert";
import { Button, BUTTON_VARIANT } from "../../../shared/ui/button";

interface CsvImportViewProps {
  fileName: string | null;
  onFileChange: (file: File | null) => void;
  onPreview: () => void;
  onConfirm: () => void;
  preview: CsvImportResult | null;
  applied: CsvImportResult | null;
  pending: boolean;
  error: string | null;
}

/** Upload -> preview (diff + row errors) -> confirm (design 11). Pure. */
export function CsvImportView({
  fileName,
  onFileChange,
  onPreview,
  onConfirm,
  preview,
  applied,
  pending,
  error,
}: CsvImportViewProps) {
  const inputId = useId();
  const canConfirm = preview !== null && preview.errors.length === 0 && !pending;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Columns: category, name, reference_price_mc, is_active, external_key. Rows match existing
        items by category and name (ignoring case and accents); empty cells keep current values.{" "}
        <a href="/catalog-template.csv" download className="font-semibold text-primary">
          Download the template CSV
        </a>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-sm font-medium">
            CSV file
          </label>
          <input
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            className="min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-border file:bg-surface-raised file:px-3 file:text-foreground"
          />
        </div>
        <Button
          variant={BUTTON_VARIANT.SECONDARY}
          disabled={fileName === null || pending}
          onClick={onPreview}
        >
          Preview
        </Button>
        <Button requiresNetwork disabled={!canConfirm} onClick={onConfirm}>
          Confirm import
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {applied && (
        <p role="status" className="rounded-lg border border-primary px-3 py-2 text-sm">
          Imported: {applied.created} created, {applied.updated} updated, {applied.unchanged}{" "}
          unchanged.
        </p>
      )}
      {preview && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-4 text-sm font-semibold">
            <li>{preview.created} to create</li>
            <li>{preview.updated} to update</li>
            <li>{preview.unchanged} unchanged</li>
            {preview.errors.length > 0 && (
              <li className="text-danger">{preview.errors.length} with errors</li>
            )}
          </ul>
          {preview.errors.length > 0 && (
            <div role="group" aria-label="Row errors" className="flex flex-col gap-1">
              <p className="text-sm">
                Fix these rows; nothing is imported while any row is invalid.
              </p>
              <ul className="flex flex-col gap-1 text-sm text-danger">
                {preview.errors.map((rowError) => (
                  <li key={rowError.row}>
                    Row {rowError.row}:{" "}
                    {rowError.issues
                      .map((issue) =>
                        issue.column ? `${issue.column}: ${issue.message}` : issue.message,
                      )
                      .join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.rows.length > 0 && (
            <div className="relative overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-raised text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Row
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Item
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Category
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Action
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Changes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.row} className="border-t border-border">
                      <td className="px-3 py-2 tabular-nums">{row.row}</td>
                      <th scope="row" className="px-3 py-2 font-medium">
                        {row.name}
                      </th>
                      <td className="px-3 py-2">{row.categorySlug}</td>
                      <td className="px-3 py-2">{row.action}</td>
                      <td className="px-3 py-2 text-muted">{row.changes.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
