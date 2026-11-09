import { createFileRoute } from "@tanstack/react-router";
import { StockListContainer } from "../../../features/stock/containers/stock-list-container";
import { stockSearch } from "../../../features/stock/lib/search";

export const Route = createFileRoute("/_authed/stock/")({
  validateSearch: stockSearch,
  component: StockRoute,
});

function StockRoute() {
  return <StockListContainer search={Route.useSearch()} />;
}
