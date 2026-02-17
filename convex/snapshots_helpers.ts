import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const MAX_IDENTITY_BATCH = 100;
export const DEFAULT_REBUILD_LIMIT = 200;
export const MAX_REBUILD_LIMIT = 2000;

export type SnapshotPick = {
  _id: Id<"snapshots">;
  activeBuildId?: string;
  pendingBuildId?: string;
  downloadedAt?: number;
  parsedAt?: number;
  _creationTime: number;
};

export const isDuplicateIdentityError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("unique") ||
    message.includes("duplicate") ||
    message.includes("already exists")
  );
};

export const normalizeLimit = (
  requested: number | undefined,
  defaultLimit: number,
  maxLimit: number,
) => {
  if (requested === undefined) {
    return defaultLimit;
  }
  const parsed = Number(requested);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Limit must be a positive integer",
    });
  }
  return Math.min(parsed, maxLimit);
};

export const pickBestSnapshot = (snapshots: SnapshotPick[]) => {
  if (snapshots.length === 0) {
    return null;
  }
  const score = (snapshot: SnapshotPick) => [
    snapshot.activeBuildId ? 1 : 0,
    snapshot.pendingBuildId ? 1 : 0,
    snapshot.downloadedAt ?? 0,
    snapshot.parsedAt ?? 0,
    snapshot._creationTime,
  ];
  let best = snapshots[0];
  let bestScore = score(best);
  for (let i = 1; i < snapshots.length; i += 1) {
    const candidate = snapshots[i];
    const candidateScore = score(candidate);
    for (let j = 0; j < candidateScore.length; j += 1) {
      if (candidateScore[j] > bestScore[j]) {
        best = candidate;
        bestScore = candidateScore;
        break;
      }
      if (candidateScore[j] < bestScore[j]) {
        break;
      }
    }
  }
  return best;
};

export const findSnapshotByIdentity = async (
  ctx: { db: any },
  datasetKey: string,
  regionCode: string,
  asOfDate: string,
) => {
  const matches = await ctx.db
    .query("snapshots")
    .withIndex("by_identity", (q: any) =>
      q.eq("datasetKey", datasetKey).eq("regionCode", regionCode).eq("asOfDate", asOfDate),
    )
    .take(3);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length === 2) {
    return pickBestSnapshot(matches) ?? matches[0];
  }
  const allMatches = await ctx.db
    .query("snapshots")
    .withIndex("by_identity", (q: any) =>
      q.eq("datasetKey", datasetKey).eq("regionCode", regionCode).eq("asOfDate", asOfDate),
    )
    .collect();
  return pickBestSnapshot(allMatches) ?? matches[0];
};
