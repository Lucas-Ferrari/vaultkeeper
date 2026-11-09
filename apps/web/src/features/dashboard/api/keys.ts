/** Valuation query keys (design 13); catalog price/active edits invalidate valuationKeys.all. */
export const valuationKeys = {
  all: ["valuation"] as const,
  summary: (accountId?: string) => [...valuationKeys.all, "summary", accountId ?? null] as const,
  group: (id: string) => [...valuationKeys.all, "group", id] as const,
};
