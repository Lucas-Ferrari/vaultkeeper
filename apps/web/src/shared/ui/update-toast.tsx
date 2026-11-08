import { useRegisterSW } from "virtual:pwa-register/react";
import { Button, BUTTON_VARIANT } from "./button";

/**
 * R-PWA-4: registers the service worker (registerType 'prompt') and, when a new version is
 * waiting, asks the user to reload. "Later" hides it; the new SW takes over on the next launch.
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm shadow-lg"
    >
      <p className="flex-1">New version available</p>
      <Button variant={BUTTON_VARIANT.GHOST} onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button onClick={() => void updateServiceWorker(true)}>Reload</Button>
    </div>
  );
}
