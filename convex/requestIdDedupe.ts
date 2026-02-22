export const findExistingByRequestId = async <T extends { _id: unknown }>({
  ctx,
  table,
  requestId,
  pickBest,
}: {
  ctx: { db: any };
  table: string;
  requestId: string;
  pickBest: (matches: T[]) => T | null;
}) => {
  const matches = await ctx.db
    .query(table)
    .withIndex("by_requestId", (q: any) => q.eq("requestId", requestId))
    .take(2);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0] as T;
  }
  const allMatches = await ctx.db
    .query(table)
    .withIndex("by_requestId", (q: any) => q.eq("requestId", requestId))
    .collect();
  return pickBest(allMatches as T[]) ?? (matches[0] as T);
};
