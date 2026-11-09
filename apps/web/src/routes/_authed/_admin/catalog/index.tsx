import { createFileRoute } from "@tanstack/react-router";
import { CatalogListContainer } from "../../../../features/catalog-admin/containers/catalog-list-container";
import { adminCatalogSearch } from "../../../../features/catalog-admin/lib/search";

export const Route = createFileRoute("/_authed/_admin/catalog/")({
  validateSearch: adminCatalogSearch,
  component: CatalogRoute,
});

function CatalogRoute() {
  return <CatalogListContainer search={Route.useSearch()} />;
}
