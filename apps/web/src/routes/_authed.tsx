import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../features/auth/api/queries";
import { AuthedLayoutContainer } from "../features/auth/containers/authed-layout-container";

/** Every signed-in page lives under this layout (R-AUTH-2 on the client side). */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!me) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { me };
  },
  component: AuthedRoute,
});

function AuthedRoute() {
  const { me } = Route.useRouteContext();
  return <AuthedLayoutContainer me={me} />;
}
