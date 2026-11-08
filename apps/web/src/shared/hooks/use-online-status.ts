import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const getSnapshot = () => onlineManager.isOnline();

/**
 * Connection state as TanStack Query sees it (it listens to the browser's online/offline events),
 * so the UI and query pausing/refetching never disagree.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
