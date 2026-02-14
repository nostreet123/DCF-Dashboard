import { describe, expect, test } from "bun:test";
import {
  buildAssetDryRunGroupPatch,
  buildCleanupCompletePatch,
  buildSnapshotDryRunGroupPatch,
  buildSnapshotPhaseTransitionPatch,
  isCleanupLockAvailable,
  shouldScheduleCleanupChunk,
} from "../convex/maintenance/duplicateCleanup.logic";

describe("maintenance snapshot cleanup logic", () => {
  test("snapshot phase transitions to assets when snapshot groups are exhausted", () => {
    const patch = buildSnapshotPhaseTransitionPatch();
    expect(patch.phase).toBe("assets");
    expect(patch.groupCursor).toBeUndefined();
    expect(patch.currentSnapshotGroupId).toBeUndefined();
  });

  test("dry-run snapshot patch increments processed groups and delete count", () => {
    const patch = buildSnapshotDryRunGroupPatch({
      state: { snapshotGroupsProcessed: 2, snapshotsDeleted: 5 },
      nextCursor: "cursor-2",
      deleteCount: 3,
    });
    expect(patch.groupCursor).toBe("cursor-2");
    expect(patch.snapshotGroupsProcessed).toBe(3);
    expect(patch.snapshotsDeleted).toBe(8);
  });

  test("dry-run asset patch increments processed groups and delete count", () => {
    const patch = buildAssetDryRunGroupPatch({
      state: { assetGroupsProcessed: 4, assetsDeleted: 9 },
      nextCursor: null,
      deleteCount: 2,
    });
    expect(patch.groupCursor).toBeUndefined();
    expect(patch.assetGroupsProcessed).toBe(5);
    expect(patch.assetsDeleted).toBe(11);
  });

  test("completion patch marks run complete with timestamp", () => {
    const patch = buildCleanupCompletePatch(12345);
    expect(patch.status).toBe("complete");
    expect(patch.finishedAt).toBe(12345);
  });

  test("lock availability reflects in-flight timeout", () => {
    expect(isCleanupLockAvailable(undefined, 100)).toBe(true);
    expect(isCleanupLockAvailable(100, 100)).toBe(true);
    expect(isCleanupLockAvailable(90, 100)).toBe(true);
    expect(isCleanupLockAvailable(101, 100)).toBe(false);
  });

  test("scheduler only queues while cleanup is running", () => {
    expect(shouldScheduleCleanupChunk("running")).toBe(true);
    expect(shouldScheduleCleanupChunk("stopped")).toBe(false);
    expect(shouldScheduleCleanupChunk("complete")).toBe(false);
  });
});
