import type { Id } from "../_generated/dataModel";

type SnapshotIdentity = {
  datasetKey: string;
  regionCode: string;
  asOfDate: string;
  ids: Array<Id<"snapshots">>;
};

type AssetIdentity = {
  assetKey: string;
  ids: Array<Id<"assets">>;
};

type SnapshotPageItem = {
  _id: Id<"snapshots">;
  datasetKey: string;
  regionCode: string;
  asOfDate: string;
};

type AssetPageItem = {
  _id: Id<"assets">;
  assetKey?: string;
};

export const groupSnapshotDuplicatesPage = (
  page: SnapshotPageItem[],
  carry: SnapshotIdentity | null,
  hasNextPage: boolean,
) => {
  const duplicates: Array<{
    datasetKey: string;
    regionCode: string;
    asOfDate: string;
    count: number;
    ids: Array<Id<"snapshots">>;
  }> = [];

  let current = carry && carry.ids.length > 0 ? { ...carry, ids: [...carry.ids] } : null;

  const pushCurrentIfDuplicate = () => {
    if (current && current.ids.length > 1) {
      duplicates.push({
        datasetKey: current.datasetKey,
        regionCode: current.regionCode,
        asOfDate: current.asOfDate,
        count: current.ids.length,
        ids: current.ids,
      });
    }
  };

  for (const snapshot of page) {
    if (!current) {
      current = {
        datasetKey: snapshot.datasetKey,
        regionCode: snapshot.regionCode,
        asOfDate: snapshot.asOfDate,
        ids: [snapshot._id],
      };
      continue;
    }
    const sameIdentity =
      snapshot.datasetKey === current.datasetKey &&
      snapshot.regionCode === current.regionCode &&
      snapshot.asOfDate === current.asOfDate;
    if (sameIdentity) {
      current.ids.push(snapshot._id);
      continue;
    }
    pushCurrentIfDuplicate();
    current = {
      datasetKey: snapshot.datasetKey,
      regionCode: snapshot.regionCode,
      asOfDate: snapshot.asOfDate,
      ids: [snapshot._id],
    };
  }

  if (!hasNextPage) {
    pushCurrentIfDuplicate();
  }

  return {
    duplicates,
    carry: hasNextPage ? current : null,
  };
};

export const groupAssetDuplicatesPage = (
  page: AssetPageItem[],
  carry: AssetIdentity | null,
  hasNextPage: boolean,
) => {
  const duplicates: Array<{
    assetKey: string;
    count: number;
    ids: Array<Id<"assets">>;
  }> = [];

  let current = carry && carry.ids.length > 0 ? { ...carry, ids: [...carry.ids] } : null;

  const pushCurrentIfDuplicate = () => {
    if (current && current.ids.length > 1) {
      duplicates.push({
        assetKey: current.assetKey,
        count: current.ids.length,
        ids: current.ids,
      });
    }
  };

  for (const asset of page) {
    if (!asset.assetKey) {
      continue;
    }
    if (current && asset.assetKey === current.assetKey) {
      current.ids.push(asset._id);
      continue;
    }
    pushCurrentIfDuplicate();
    current = { assetKey: asset.assetKey, ids: [asset._id] };
  }

  if (!hasNextPage) {
    pushCurrentIfDuplicate();
  }

  return {
    duplicates,
    carry: hasNextPage ? current : null,
  };
};
