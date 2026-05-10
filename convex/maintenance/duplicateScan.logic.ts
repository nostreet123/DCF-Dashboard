import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  DuplicateAssetCarry,
  DuplicateScanSampleAssets,
  DuplicateScanSampleLimit,
  DuplicateScanSampleSnapshots,
  DuplicateSnapshotCarry,
} from "./shared";

export const DuplicateScanStatePatchValidator = v.object({
  phase: v.optional(v.union(v.literal("snapshots"), v.literal("assets"))),
  status: v.optional(
    v.union(v.literal("running"), v.literal("complete"), v.literal("error"), v.literal("stopped")),
  ),
  snapshotCursor: v.optional(v.string()),
  snapshotCarry: v.optional(DuplicateSnapshotCarry),
  assetCursor: v.optional(v.string()),
  assetCarry: v.optional(DuplicateAssetCarry),
  snapshotPagesScanned: v.optional(v.number()),
  assetPagesScanned: v.optional(v.number()),
  snapshotDuplicateGroups: v.optional(v.number()),
  assetDuplicateGroups: v.optional(v.number()),
  snapshotSample: v.optional(DuplicateScanSampleSnapshots),
  assetSample: v.optional(DuplicateScanSampleAssets),
  finishedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  inFlightUntil: v.optional(v.number()),
});

export type DuplicateScanStatePatch = {
  phase?: "snapshots" | "assets";
  status?: "running" | "complete" | "error" | "stopped";
  snapshotCursor?: string;
  snapshotCarry?: {
    datasetKey: string;
    regionCode: string;
    asOfDate: string;
    ids: Array<Id<"snapshots">>;
  };
  assetCursor?: string;
  assetCarry?: { assetKey: string; ids: Array<Id<"assets">> };
  snapshotPagesScanned?: number;
  assetPagesScanned?: number;
  snapshotDuplicateGroups?: number;
  assetDuplicateGroups?: number;
  snapshotSample?: Array<{
      datasetKey: string;
      regionCode: string;
      asOfDate: string;
      count: number;
      ids: Array<Id<"snapshots">>;
    }>;
  assetSample?: Array<{
    assetKey: string;
    count: number;
    ids: Array<Id<"assets">>;
  }>;
  finishedAt?: number;
  error?: string;
  inFlightUntil?: number;
};

const appendSample = <T>(current: T[] | undefined, additions: T[]) => {
  const next = (current ?? []).slice();
  for (const entry of additions) {
    if (next.length >= DuplicateScanSampleLimit) break;
    next.push(entry);
  }
  return next;
};

export const buildSnapshotPhasePatch = (params: {
      state: {
    snapshotPagesScanned: number;
    snapshotDuplicateGroups: number;
    snapshotSample?: Array<{
      datasetKey: string;
      regionCode: string;
      asOfDate: string;
      count: number;
      ids: Array<Id<"snapshots">>;
    }>;
  };
  nextCursor: string | null;
  carry:
    | {
        datasetKey: string;
        regionCode: string;
        asOfDate: string;
        ids: Array<Id<"snapshots">>;
      }
    | null;
  duplicates: Array<{
    datasetKey: string;
    regionCode: string;
    asOfDate: string;
    count: number;
    ids: Array<Id<"snapshots">>;
  }>;
}): DuplicateScanStatePatch => {
  const patch: DuplicateScanStatePatch = {
    snapshotCursor: params.nextCursor ?? undefined,
    snapshotCarry: params.carry ?? undefined,
    snapshotPagesScanned: params.state.snapshotPagesScanned + 1,
    snapshotDuplicateGroups: params.state.snapshotDuplicateGroups + params.duplicates.length,
    snapshotSample: appendSample(params.state.snapshotSample, params.duplicates),
  };
  if (!params.nextCursor) {
    patch.phase = "assets";
  }
  return patch;
};

export const buildAssetPhasePatch = (params: {
  state: {
    assetPagesScanned: number;
    assetDuplicateGroups: number;
    assetSample?: Array<{ assetKey: string; count: number; ids: Array<Id<"assets">> }>;
  };
  nextCursor: string | null;
  carry: { assetKey: string; ids: Array<Id<"assets">> } | null;
  duplicates: Array<{ assetKey: string; count: number; ids: Array<Id<"assets">> }>;
  now: number;
}): DuplicateScanStatePatch => {
  const patch: DuplicateScanStatePatch = {
    assetCursor: params.nextCursor ?? undefined,
    assetCarry: params.carry ?? undefined,
    assetPagesScanned: params.state.assetPagesScanned + 1,
    assetDuplicateGroups: params.state.assetDuplicateGroups + params.duplicates.length,
    assetSample: appendSample(params.state.assetSample, params.duplicates),
  };
  if (!params.nextCursor) {
    patch.status = "complete";
    patch.finishedAt = params.now;
  }
  return patch;
};

export const shouldScheduleNextChunk = (status: string | undefined) => status === "running";
