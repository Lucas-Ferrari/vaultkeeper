import { Link } from "@tanstack/react-router";
import type { CsvImportResult } from "@vaultkeeper/shared/schemas/csv";
import { useState } from "react";
import { useImportCsv } from "../api/mutations";
import { CsvImportView } from "../components/csv-import-view";
import { adminErrorMessage } from "../lib/messages";

/** /catalog/import (R-CAT-5): the same file is sent twice, as a preview then for real. */
export function CsvImportContainer() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvImportResult | null>(null);
  const [applied, setApplied] = useState<CsvImportResult | null>(null);
  const importCsv = useImportCsv();

  const onFileChange = (next: File | null) => {
    setFile(next);
    setPreview(null);
    setApplied(null);
    importCsv.reset();
  };
  const run = (dryRun: boolean) => {
    if (!file) return;
    setApplied(null);
    importCsv.mutate(
      { file, dryRun },
      {
        onSuccess: (result) => {
          if (result.dryRun) {
            setPreview(result);
          } else {
            setPreview(null);
            setApplied(result);
          }
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-4">
      <Link to="/catalog" className="text-sm text-primary">
        ← Catalog
      </Link>
      <h1 className="text-2xl font-bold">Import catalog CSV</h1>
      <CsvImportView
        fileName={file?.name ?? null}
        onFileChange={onFileChange}
        onPreview={() => run(true)}
        onConfirm={() => run(false)}
        preview={preview}
        applied={applied}
        pending={importCsv.isPending}
        error={importCsv.error ? adminErrorMessage(importCsv.error) : null}
      />
    </section>
  );
}
