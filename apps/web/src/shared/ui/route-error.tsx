import { useOnlineStatus } from "../hooks/use-online-status";
import { Button, BUTTON_VARIANT } from "./button";

interface RouteErrorProps {
  onRetry: () => void;
}

/**
 * Root route error view, rendered inside the app shell. Offline (R-PWA-3 S1) the precached shell
 * still loads but /api is NetworkOnly, so route guards fail: say so plainly instead of crashing.
 */
export function RouteError({ onRetry }: RouteErrorProps) {
  const online = useOnlineStatus();

  return (
    <section className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">
        {online ? "Something went wrong" : "You are offline"}
      </h1>
      <p className="text-sm text-muted">
        {online
          ? "The page could not be loaded. Please try again."
          : "This page needs a connection. It will load again once you reconnect."}
      </p>
      <Button variant={BUTTON_VARIANT.SECONDARY} onClick={onRetry}>
        Retry
      </Button>
    </section>
  );
}
