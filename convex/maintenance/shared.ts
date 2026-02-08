import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const RetentionDays = v.object({
  syncLogs: v.optional(v.number()),
  syncErrors: v.optional(v.number()),
  syncLogIncrements: v.optional(v.number()),
  valuationRunTraces: v.optional(v.number()),
  valuationRunInlineTraces: v.optional(v.number()),
  debugEventsError: v.optional(v.number()),
  debugEventsStandard: v.optional(v.number()),
});

export const PageType = v.union(v.literal("current"), v.literal("archive"));

export const DuplicateSnapshotCarry = v.object({
  datasetKey: v.string(),
  regionCode: v.string(),
  asOfDate: v.string(),
  ids: v.array(v.id("snapshots")),
});

export const DuplicateAssetCarry = v.object({
  assetKey: v.string(),
  ids: v.array(v.id("assets")),
});

export const DuplicateScanSampleSnapshots = v.array(
  v.object({
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(),
    count: v.number(),
    ids: v.array(v.id("snapshots")),
  }),
);

export const DuplicateScanSampleAssets = v.array(
  v.object({
    assetKey: v.string(),
    count: v.number(),
    ids: v.array(v.id("assets")),
  }),
);

export const makeDuplicateScanRunId = (): string => {
  // No need for crypto-grade randomness; this is only for deconflicting scheduled jobs.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeRetentionDays = (value: number | undefined, defaultDays: number) => {
  if (value === undefined) {
    return defaultDays;
  }
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Retention days must be a positive integer",
    });
  }
  return Math.min(days, 3650);
};

export const normalizeDeleteLimit = (value: number | undefined, defaultLimit: number) => {
  if (value === undefined) {
    return defaultLimit;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "maxDeletes must be a positive integer",
    });
  }
  return Math.min(limit, 1000);
};

export const normalizePageLimit = (value: number | undefined, defaultLimit: number) => {
  if (value === undefined) {
    return defaultLimit;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "limit must be a positive integer",
    });
  }
  return Math.min(limit, 1000);
};

export const cutoffMs = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

export const DuplicateScanKey = "default";
export const DuplicateScanSampleLimit = 25;
export const DuplicateGroupInsertBatch = 200;

export const DuplicateCleanupKey = "default";
export const DuplicateCleanupGroupLimit = 1;
export const DuplicateCleanupDeleteLimit = 500;

export const pickSnapshotKeepId = (
  snapshots: Array<{
    _id: Id<"snapshots">;
    activeBuildId?: string;
    pendingBuildId?: string;
    downloadedAt?: number;
    parsedAt?: number;
    _creationTime: number;
  }>,
) => {
  if (snapshots.length === 0) {
    return null;
  }
  const score = (snapshot: typeof snapshots[number]) => [
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
  return best._id;
};

export const pickAssetKeepId = (
  assets: Array<{
    _id: Id<"assets">;
    resolved: boolean;
    discoveredAt?: number;
    _creationTime: number;
  }>,
) => {
  if (assets.length === 0) {
    return null;
  }
  const score = (asset: typeof assets[number]) => [
    asset.resolved ? 1 : 0,
    asset.discoveredAt ?? 0,
    asset._creationTime,
  ];
  let best = assets[0];
  let bestScore = score(best);
  for (let i = 1; i < assets.length; i += 1) {
    const candidate = assets[i];
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
  return best._id;
};
