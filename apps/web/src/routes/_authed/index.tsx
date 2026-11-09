import { createFileRoute } from "@tanstack/react-router";
import { DashboardContainer } from "../../features/dashboard/containers/dashboard-container";

/** Dashboard: valuation of the user's stock (task 5.9). */
export const Route = createFileRoute("/_authed/")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { me } = Route.useRouteContext();
  return <DashboardContainer name={me.name} />;
}
