import { createFileRoute } from "@tanstack/react-router";
import { ItemEditContainer } from "../../../../features/catalog-admin/containers/item-edit-container";

export const Route = createFileRoute("/_authed/_admin/catalog/$itemId")({
  component: ItemRoute,
});

function ItemRoute() {
  const { itemId } = Route.useParams();
  return <ItemEditContainer itemId={itemId} />;
}
