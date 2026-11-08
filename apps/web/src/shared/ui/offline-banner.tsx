import { useOnlineStatus } from "../hooks/use-online-status";

/** R-PWA-3: clear offline indicator; previously loaded data stays visible but may be stale. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-label="Connection"
      className="sticky top-0 z-40 border-b border-danger bg-surface-raised px-4 py-2 text-center text-sm"
    >
      You are offline, data may be stale. Saving is disabled until you reconnect.
    </div>
  );
}
