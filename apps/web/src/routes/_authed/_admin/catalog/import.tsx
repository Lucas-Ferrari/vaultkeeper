import { createFileRoute } from "@tanstack/react-router";
import { CsvImportContainer } from "../../../../features/catalog-admin/containers/csv-import-container";

export const Route = createFileRoute("/_authed/_admin/catalog/import")({
  component: CsvImportContainer,
});
