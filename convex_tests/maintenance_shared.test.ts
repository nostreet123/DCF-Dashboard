import { describe, expect, test } from "bun:test";
import { pickAssetKeepId, pickSnapshotKeepId } from "../convex/maintenance/shared";

describe("pickSnapshotKeepId", () => {
  test("returns null for empty input", () => {
    expect(pickSnapshotKeepId([])).toBeNull();
  });

  test("prefers snapshots with activeBuildId", () => {
    const keepId = pickSnapshotKeepId([
      {
        _id: "a" as any,
        activeBuildId: undefined,
        pendingBuildId: undefined,
        downloadedAt: 100,
        parsedAt: 100,
        _creationTime: 100,
      },
      {
        _id: "b" as any,
        activeBuildId: "build",
        pendingBuildId: undefined,
        downloadedAt: 0,
        parsedAt: 0,
        _creationTime: 0,
      },
    ]);
    expect(keepId).toBe("b");
  });

  test("uses downloadedAt to break ties", () => {
    const keepId = pickSnapshotKeepId([
      {
        _id: "a" as any,
        activeBuildId: "build",
        pendingBuildId: undefined,
        downloadedAt: 10,
        parsedAt: 0,
        _creationTime: 0,
      },
      {
        _id: "b" as any,
        activeBuildId: "build",
        pendingBuildId: undefined,
        downloadedAt: 20,
        parsedAt: 0,
        _creationTime: 0,
      },
    ]);
    expect(keepId).toBe("b");
  });
});

describe("pickAssetKeepId", () => {
  test("returns null for empty input", () => {
    expect(pickAssetKeepId([])).toBeNull();
  });

  test("prefers resolved assets", () => {
    const keepId = pickAssetKeepId([
      { _id: "a" as any, resolved: false, discoveredAt: 100, _creationTime: 0 },
      { _id: "b" as any, resolved: true, discoveredAt: 0, _creationTime: 0 },
    ]);
    expect(keepId).toBe("b");
  });

  test("uses discoveredAt to break ties", () => {
    const keepId = pickAssetKeepId([
      { _id: "a" as any, resolved: true, discoveredAt: 1, _creationTime: 0 },
      { _id: "b" as any, resolved: true, discoveredAt: 2, _creationTime: 0 },
    ]);
    expect(keepId).toBe("b");
  });
});

