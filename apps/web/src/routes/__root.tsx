import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Outlet,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { RootLayout } from "../shared/layouts/root-layout";
import { RouteError } from "../shared/ui/route-error";
import { UpdateToast } from "../shared/ui/update-toast";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: RootError,
});

/** Keeps the shell (offline banner, footer) around a failed route instead of a bare crash. */
function RootError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <RootLayout>
      <RouteError
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    </RootLayout>
  );
}

function RootComponent() {
  return (
    <RootLayout>
      <Outlet />
      <UpdateToast />
    </RootLayout>
  );
}
