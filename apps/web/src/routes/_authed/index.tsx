import { createFileRoute } from "@tanstack/react-router";

/** Dashboard. Placeholder until the valuation dashboard lands (phase 5). */
export const Route = createFileRoute("/_authed/")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { me } = Route.useRouteContext();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted">
        Welcome, {me.name}. Track your items across accounts, vaults and characters.
      </p>
    </section>
  );
}
