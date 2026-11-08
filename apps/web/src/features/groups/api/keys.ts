/** Group query keys (design 13). Stock writes invalidate groupKeys.all (memberships, totals). */
export const groupKeys = {
  all: ["groups"] as const,
  list: () => [...groupKeys.all, "list"] as const,
  detail: (id: string) => [...groupKeys.all, "detail", id] as const,
};
