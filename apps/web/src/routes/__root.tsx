import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { RootLayout } from "../shared/layouts/root-layout";
import { UpdateToast } from "../shared/ui/update-toast";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootLayout>
      <Outlet />
      <UpdateToast />
    </RootLayout>
  );
}
