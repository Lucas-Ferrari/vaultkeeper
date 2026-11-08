import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../features/auth/api/queries";
import { RegisterContainer } from "../features/auth/containers/register-container";
import { safeRedirectPath } from "../features/auth/lib/redirect";
import { authSearch } from "../features/auth/lib/search";

export const Route = createFileRoute("/register")({
  validateSearch: authSearch.pick({ redirect: true }),
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (me) throw redirect({ href: safeRedirectPath(search.redirect) });
  },
  component: RegisterRoute,
});

function RegisterRoute() {
  const { redirect: next } = Route.useSearch();
  return <RegisterContainer redirect={next} />;
}
