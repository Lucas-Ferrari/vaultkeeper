/** Group query keys (design 13). Stock writes invalidate groupKeys.all (memberships, totals). */
export const groupKeys = {
  all: ["groups"] as const,
};
