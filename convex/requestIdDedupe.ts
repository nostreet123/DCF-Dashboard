import type { DatabaseReader } from "./_generated/server";

type RequestIdTable = "syncLogs" | "valuationRuns";

export const findExistingByRequestId = async <T extends { _id: unknown }>({
  ctx,
  table,
  requestId,
  pickBest,
}: {
  ctx: { db: DatabaseReader };
  table: RequestIdTable;
  requestId: string;
  pickBest: (matches: T[]) => T | null;
}) => {
  const matches = await ctx.db
    .query(table)
    .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
    .take(2);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0] as unknown as T;
  }
  const allMatches = await ctx.db
    .query(table)
    .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
    .collect();
  return pickBest(allMatches as unknown as T[]) ?? (matches[0] as unknown as T);
};
