export { backfillAssetKeysPage } from "./maintenance/backfill";
export { pruneOperationalData } from "./maintenance/pruning";

export {
  clearDuplicateGroupsForScanInternal,
  findDuplicateAssetsPage,
  findDuplicateAssetsPageInternal,
  findDuplicateSnapshotsPage,
  findDuplicateSnapshotsPageInternal,
  getAssetsByIdsInternal,
  getDuplicateScanState,
  getDuplicateScanStateInternal,
  getSnapshotsByIdsInternal,
  insertAssetGroupsInternal,
  insertSnapshotGroupsInternal,
  listDuplicateAssetGroups,
  listDuplicateAssetGroupsPageInternal,
  listDuplicateSnapshotGroups,
  listDuplicateSnapshotGroupsPageInternal,
  releaseDuplicateScanLockInternal,
  resetDuplicateScanAndStartInternal,
  runDuplicateScanChunk,
  runDuplicateScanTick,
  // Deprecated alias kept for backward compatibility.
  runDuplicateScanOnce,
  startDuplicateScan,
  stopDuplicateScan,
  tryAcquireDuplicateScanLockInternal,
  updateDuplicateScanStateInternal,
} from "./maintenance/duplicateScan";

export {
  deleteAssetByIdInternal,
  deleteAssetGroupByIdInternal,
  deleteSnapshotByIdInternal,
  deleteSnapshotGroupByIdInternal,
  deleteTableDataBySnapshotPageInternal,
  getDuplicateCleanupState,
  getDuplicateCleanupStateInternal,
  releaseDuplicateCleanupLockInternal,
  runDuplicateCleanupChunk,
  startDuplicateCleanup,
  stopDuplicateCleanup,
  tryAcquireDuplicateCleanupLockInternal,
  updateDuplicateCleanupStateInternal,
} from "./maintenance/duplicateCleanup";
