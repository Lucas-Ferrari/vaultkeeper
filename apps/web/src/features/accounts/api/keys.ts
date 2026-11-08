/** Game account query keys (design 13), hierarchical for targeted invalidation. */
export const accountKeys = {
  all: ["accounts"] as const,
  list: () => [...accountKeys.all, "list"] as const,
  detail: (id: string) => [...accountKeys.all, "detail", id] as const,
  characters: (id: string) => [...accountKeys.all, "characters", id] as const,
  /** Prefix of every account's storage (stock writes change entry counts everywhere). */
  storageAll: () => [...accountKeys.all, "storage"] as const,
  storage: (id: string) => [...accountKeys.storageAll(), id] as const,
};
