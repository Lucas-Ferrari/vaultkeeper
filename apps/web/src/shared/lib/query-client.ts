import {
  MutationCache,
  onlineManager,
  QueryClient,
  type DefaultOptions,
} from "@tanstack/react-query";

export const OFFLINE_SAVE_MESSAGE = "You are offline. Changes can't be saved until you reconnect.";

/** A write attempted without a connection. Thrown before any request is made. */
export class OfflineError extends Error {
  override readonly name = "OfflineError";

  constructor() {
    super(OFFLINE_SAVE_MESSAGE);
  }
}

/**
 * The app's QueryClient (design 13, R-PWA-3). TanStack's default networkMode 'online' would PAUSE
 * an offline mutation and replay it on reconnect, i.e. queue it silently. The MVP forbids that:
 * mutations run in 'always' mode and the cache fails them up front while offline, so nothing is
 * sent and nothing waits. Queries keep the default: they pause offline and refetch on reconnect.
 */
export function createQueryClient(defaultOptions: DefaultOptions = {}): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onMutate: () => {
        if (!onlineManager.isOnline()) throw new OfflineError();
      },
    }),
    defaultOptions: {
      ...defaultOptions,
      mutations: { ...defaultOptions.mutations, networkMode: "always", retry: false },
    },
  });
}
