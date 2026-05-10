/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import type { Id } from "../convex/_generated/dataModel";
import { buildAssetPhasePatch, buildSnapshotPhasePatch, shouldScheduleNextChunk } from "../convex/maintenance/duplicateScan.logic";
import { groupAssetDuplicatesPage, groupSnapshotDuplicatesPage } from "../convex/maintenance/duplicateScan.page";

const snapshotId = (value: string) => value as unknown as Id<"snapshots">;
const assetId = (value: string) => value as unknown as Id<"assets">;

describe("duplicateScan.page", () => {
  test("groups snapshot duplicates across page carry", () => {
    const page1 = [
      { _id: snapshotId("s1"), datasetKey: "d", regionCode: "us", asOfDate: "2024-01-01" },
      { _id: snapshotId("s2"), datasetKey: "d", regionCode: "us", asOfDate: "2024-01-01" },
      { _id: snapshotId("s3"), datasetKey: "d2", regionCode: "us", asOfDate: "2024-01-01" },
    ];
    const r1 = groupSnapshotDuplicatesPage(page1, null, true);
    expect(r1.duplicates.length).toBe(1);
    expect(r1.duplicates[0].count).toBe(2);
    expect(r1.carry?.datasetKey).toBe("d2");

    const page2 = [
      { _id: snapshotId("s4"), datasetKey: "d2", regionCode: "us", asOfDate: "2024-01-01" },
      { _id: snapshotId("s5"), datasetKey: "d3", regionCode: "us", asOfDate: "2024-01-01" },
    ];
    const r2 = groupSnapshotDuplicatesPage(page2, r1.carry, false);
    expect(r2.duplicates.length).toBe(1);
    expect(r2.duplicates[0].datasetKey).toBe("d2");
    expect(r2.duplicates[0].count).toBe(2);
    expect(r2.carry).toBeNull();
  });

  test("groups asset duplicates and ignores missing keys", () => {
    const page = [
      { _id: assetId("a1"), assetKey: "k1" },
      { _id: assetId("a2"), assetKey: "k1" },
      { _id: assetId("a3"), assetKey: undefined },
      { _id: assetId("a4"), assetKey: "k2" },
    ];
    const r = groupAssetDuplicatesPage(page, null, false);
    expect(r.duplicates.length).toBe(1);
    expect(r.duplicates[0].assetKey).toBe("k1");
    expect(r.duplicates[0].count).toBe(2);
  });
});

describe("duplicateScan.logic", () => {
  test("buildSnapshotPhasePatch advances to asset phase when cursor is exhausted", () => {
    const patch = buildSnapshotPhasePatch({
      state: {
        snapshotPagesScanned: 1,
        snapshotDuplicateGroups: 2,
        snapshotSample: [],
      },
      nextCursor: null,
      carry: null,
      duplicates: [
        {
          datasetKey: "d",
          regionCode: "us",
          asOfDate: "2024-01-01",
          count: 2,
          ids: [snapshotId("s1"), snapshotId("s2")],
        },
      ],
    });
    expect(patch.phase).toBe("assets");
    expect(patch.snapshotPagesScanned).toBe(2);
    expect(patch.snapshotDuplicateGroups).toBe(3);
    expect((patch.snapshotSample ?? []).length).toBe(1);
  });

  test("buildAssetPhasePatch marks run complete at final page", () => {
    const patch = buildAssetPhasePatch({
      state: {
        assetPagesScanned: 3,
        assetDuplicateGroups: 4,
        assetSample: [],
      },
      nextCursor: null,
      carry: null,
      duplicates: [{ assetKey: "k1", count: 2, ids: [assetId("a1"), assetId("a2")] }],
      now: 1234,
    });
    expect(patch.status).toBe("complete");
    expect(patch.finishedAt).toBe(1234);
    expect(patch.assetPagesScanned).toBe(4);
    expect(patch.assetDuplicateGroups).toBe(5);
  });

  test("shouldScheduleNextChunk only for running state", () => {
    expect(shouldScheduleNextChunk("running")).toBeTrue();
    expect(shouldScheduleNextChunk("complete")).toBeFalse();
    expect(shouldScheduleNextChunk(undefined)).toBeFalse();
  });
});
