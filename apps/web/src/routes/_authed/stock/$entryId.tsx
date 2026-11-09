import { createFileRoute } from "@tanstack/react-router";
import { StockEditContainer } from "../../../features/stock/containers/stock-form-container";

export const Route = createFileRoute("/_authed/stock/$entryId")({
  component: EntryRoute,
});

function EntryRoute() {
  const { entryId } = Route.useParams();
  return <StockEditContainer key={entryId} entryId={entryId} />;
}
