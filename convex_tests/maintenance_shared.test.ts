/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import type { Id } from "../convex/_generated/dataModel";
import { pickAssetKeepId, pickSnapshotKeepId } from "../convex/maintenance/shared";

const snapshotId = (value: string) => value as unknown as Id<"snapshots">;
const assetId = (value: string) => value as unknown as Id<"assets">;

describe("pickSnapshotKeepId", () => {
  test("returns null for empty input", () => {
    expect(pickSnapshotKeepId([])).toBeNull();
  });

  test("prefers snapshots with activeBuildId", () => {
    const keepId = pickSnapshotKeepId([
      {
        _id: snapshotId("a"),
        activeBuildId: undefined,
        pendingBuildId: undefined,
        downloadedAt: 100,
        parsedAt: 100,
        _creationTime: 100,
      },
      {
        _id: snapshotId("b"),
        activeBuildId: "build",
        pendingBuildId: undefined,
        downloadedAt: 0,
        parsedAt: 0,
        _creationTime: 0,
      },
    ]);
    expect(keepId).toBe(snapshotId("b"));
  });

  test("uses downloadedAt to break ties", () => {
    const keepId = pickSnapshotKeepId([
      {
        _id: snapshotId("a"),
        activeBuildId: "build",
        pendingBuildId: undefined,
        downloadedAt: 10,
        parsedAt: 0,
        _creationTime: 0,
      },
      {
        _id: snapshotId("b"),
        activeBuildId: "build",
        pendingBuildId: undefined,
        downloadedAt: 20,
        parsedAt: 0,
        _creationTime: 0,
      },
    ]);
    expect(keepId).toBe(snapshotId("b"));
  });
});

describe("pickAssetKeepId", () => {
  test("returns null for empty input", () => {
    expect(pickAssetKeepId([])).toBeNull();
  });

  test("prefers resolved assets", () => {
    const keepId = pickAssetKeepId([
      { _id: assetId("a"), resolved: false, discoveredAt: 100, _creationTime: 0 },
      { _id: assetId("b"), resolved: true, discoveredAt: 0, _creationTime: 0 },
    ]);
    expect(keepId).toBe(assetId("b"));
  });

  test("uses discoveredAt to break ties", () => {
    const keepId = pickAssetKeepId([
      { _id: assetId("a"), resolved: true, discoveredAt: 1, _creationTime: 0 },
      { _id: assetId("b"), resolved: true, discoveredAt: 2, _creationTime: 0 },
    ]);
    expect(keepId).toBe(assetId("b"));
  });
});
