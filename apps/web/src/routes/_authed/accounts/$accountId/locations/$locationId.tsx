import { createFileRoute } from "@tanstack/react-router";
import { LocationContainer } from "../../../../../features/accounts/containers/location-container";

export const Route = createFileRoute("/_authed/accounts/$accountId/locations/$locationId")({
  component: LocationRoute,
});

function LocationRoute() {
  const { accountId, locationId } = Route.useParams();
  return <LocationContainer accountId={accountId} locationId={locationId} />;
}
