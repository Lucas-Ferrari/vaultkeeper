import { createFileRoute, redirect } from "@tanstack/react-router";
import { ROLE } from "@vaultkeeper/shared/constants";

/**
 * Admin-only pages (catalog, settings). UX guard only: the API enforces R-AUTH-4 with 403s.
 * No component: renders its child route.
 */
export const Route = createFileRoute("/_authed/_admin")({
  beforeLoad: ({ context }) => {
    if (context.me.role !== ROLE.ADMIN) throw redirect({ to: "/" });
  },
});
