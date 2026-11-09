import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQueryOptions } from "../features/auth/api/queries";
import { LoginContainer } from "../features/auth/containers/login-container";
import { safeRedirectPath } from "../features/auth/lib/redirect";
import { authSearch } from "../features/auth/lib/search";

export const Route = createFileRoute("/login")({
  validateSearch: authSearch,
  beforeLoad: async ({ context, search }) => {
    // Already signed in (e.g. back button after login): go where they were heading.
    const me = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (me) throw redirect({ href: safeRedirectPath(search.redirect) });
  },
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect: next, error } = Route.useSearch();
  return <LoginContainer redirect={next} error={error} />;
}
