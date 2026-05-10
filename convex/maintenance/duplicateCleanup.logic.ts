import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const DuplicateCleanupStatePatchValidator = v.object({
  status: v.optional(v.union(v.literal("running"), v.literal("complete"), v.literal("error"), v.literal("stopped"))),
  phase: v.optional(v.union(v.literal("snapshots"), v.literal("assets"))),
  groupCursor: v.optional(v.string()),
  currentSnapshotGroupId: v.optional(v.id("duplicateSnapshotGroups")),
  snapshotDeleteIds: v.optional(v.array(v.id("snapshots"))),
  currentSnapshotId: v.optional(v.id("snapshots")),
  snapshotDeleteCursor: v.optional(v.string()),
  currentAssetGroupId: v.optional(v.id("duplicateAssetGroups")),
  assetDeleteIds: v.optional(v.array(v.id("assets"))),
  assetDeleteIndex: v.optional(v.number()),
  snapshotGroupsProcessed: v.optional(v.number()),
  snapshotsDeleted: v.optional(v.number()),
  tableRowsDeleted: v.optional(v.number()),
  assetGroupsProcessed: v.optional(v.number()),
  assetsDeleted: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  inFlightUntil: v.optional(v.number()),
});

export type DuplicateCleanupStatePatch = {
  status?: "running" | "complete" | "error" | "stopped";
  phase?: "snapshots" | "assets";
  groupCursor?: string;
  currentSnapshotGroupId?: Id<"duplicateSnapshotGroups">;
  snapshotDeleteIds?: Array<Id<"snapshots">>;
  currentSnapshotId?: Id<"snapshots">;
  snapshotDeleteCursor?: string;
  currentAssetGroupId?: Id<"duplicateAssetGroups">;
  assetDeleteIds?: Array<Id<"assets">>;
  assetDeleteIndex?: number;
  snapshotGroupsProcessed?: number;
  snapshotsDeleted?: number;
  tableRowsDeleted?: number;
  assetGroupsProcessed?: number;
  assetsDeleted?: number;
  finishedAt?: number;
  error?: string;
  inFlightUntil?: number;
};

export const shouldScheduleCleanupChunk = (status: string | undefined) => status === "running";

export const isCleanupLockAvailable = (
  inFlightUntil: number | undefined,
  now: number,
): boolean => !inFlightUntil || inFlightUntil <= now;

export const buildSnapshotPhaseTransitionPatch = (): DuplicateCleanupStatePatch => ({
  phase: "assets",
  groupCursor: undefined,
  currentSnapshotGroupId: undefined,
});

export const buildSnapshotDryRunGroupPatch = (params: {
  state: {
    snapshotGroupsProcessed: number;
    snapshotsDeleted: number;
  };
  nextCursor: string | null;
  deleteCount: number;
}): DuplicateCleanupStatePatch => ({
  groupCursor: params.nextCursor ?? undefined,
  snapshotGroupsProcessed: params.state.snapshotGroupsProcessed + 1,
  snapshotsDeleted: params.state.snapshotsDeleted + params.deleteCount,
});

export const buildAssetDryRunGroupPatch = (params: {
  state: {
    assetGroupsProcessed: number;
    assetsDeleted: number;
  };
  nextCursor: string | null;
  deleteCount: number;
}): DuplicateCleanupStatePatch => ({
  groupCursor: params.nextCursor ?? undefined,
  assetGroupsProcessed: params.state.assetGroupsProcessed + 1,
  assetsDeleted: params.state.assetsDeleted + params.deleteCount,
});

export const buildCleanupCompletePatch = (now: number): DuplicateCleanupStatePatch => ({
  status: "complete",
  finishedAt: now,
});
