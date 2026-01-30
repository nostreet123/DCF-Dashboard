import { query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

const MAX_SNAPSHOT_SCAN = 50;

const snapshotRefValidator = v.object({
  snapshotId: v.id("snapshots"),
  datasetKey: v.string(),
  regionCode: v.string(),
  asOfDate: v.string(),
  activeBuildId: v.optional(v.string()),
  columnNames: v.array(v.string()),
  metricsKeys: v.array(v.string()),
});

const rowValidator = v.object({
  rowIndex: v.number(),
  primaryKey: v.string(),
  primaryKeyNorm: v.string(),
  secondaryKey: v.union(v.string(), v.null()),
  metrics: v.any(),
});

const toSnapshotRef = (snapshot: any) => ({
  snapshotId: snapshot._id,
  datasetKey: snapshot.datasetKey,
  regionCode: snapshot.regionCode,
  asOfDate: snapshot.asOfDate,
  activeBuildId: snapshot.activeBuildId,
  columnNames: snapshot.columnNames,
  metricsKeys: snapshot.metricsKeys,
});

const findLatestSnapshot = async (
  ctx: any,
  datasetKey: string,
  regionCode: string,
) => {
  const candidates = await ctx.db
    .query("snapshots")
    .withIndex("by_identity", (q: any) =>
      q.eq("datasetKey", datasetKey).eq("regionCode", regionCode),
    )
    .order("desc")
    .take(MAX_SNAPSHOT_SCAN);

  return candidates.find((snapshot: any) => snapshot.activeBuildId) ?? null;
};

const findSnapshotAtOrBefore = async (
  ctx: any,
  datasetKey: string,
  regionCode: string,
  targetDate: string,
) => {
  const candidates = await ctx.db
    .query("snapshots")
    .withIndex("by_identity", (q: any) =>
      q
        .eq("datasetKey", datasetKey)
        .eq("regionCode", regionCode)
        .lte("asOfDate", targetDate),
    )
    .order("desc")
    .take(MAX_SNAPSHOT_SCAN);

  return candidates.find((snapshot: any) => snapshot.activeBuildId) ?? null;
};

export const getLatestSnapshot = query({
  args: {
    datasetKey: v.string(),
    regionCode: v.string(),
  },
  returns: v.union(v.null(), snapshotRefValidator),
  handler: async (ctx, args) => {
    const snapshot = await findLatestSnapshot(
      ctx,
      args.datasetKey,
      args.regionCode,
    );
    if (!snapshot) {
      return null;
    }
    return toSnapshotRef(snapshot);
  },
});

export const getSnapshotAtOrBefore = query({
  args: {
    datasetKey: v.string(),
    regionCode: v.string(),
    targetDate: v.string(),
  },
  returns: v.union(v.null(), snapshotRefValidator),
  handler: async (ctx, args) => {
    const snapshot = await findSnapshotAtOrBefore(
      ctx,
      args.datasetKey,
      args.regionCode,
      args.targetDate,
    );
    if (!snapshot) {
      return null;
    }
    return toSnapshotRef(snapshot);
  },
});

export const getRow = query({
  args: {
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.optional(v.string()),
    primaryKeyNorm: v.string(),
    secondaryKey: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      snapshot: snapshotRefValidator,
      row: rowValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const snapshot = args.asOfDate
      ? await findSnapshotAtOrBefore(
          ctx,
          args.datasetKey,
          args.regionCode,
          args.asOfDate,
        )
      : await findLatestSnapshot(ctx, args.datasetKey, args.regionCode);

    if (!snapshot || !snapshot.activeBuildId) {
      return null;
    }

    const snapshotRef = toSnapshotRef(snapshot);
    const buildId = snapshot.activeBuildId;

    if (args.secondaryKey) {
      const row = await ctx.db
        .query("tableData")
        .withIndex("by_snapshot_build_primaryKeyNorm_secondaryKey", (q: any) =>
          q
            .eq("snapshotId", snapshot._id)
            .eq("buildId", buildId)
            .eq("primaryKeyNorm", args.primaryKeyNorm)
            .eq("secondaryKey", args.secondaryKey),
        )
        .unique();

      if (!row) {
        return null;
      }

      return {
        snapshot: snapshotRef,
        row: {
          rowIndex: row.rowIndex,
          primaryKey: row.primaryKey,
          primaryKeyNorm: row.primaryKeyNorm,
          secondaryKey: row.secondaryKey ?? null,
          metrics: row.metrics,
        },
      };
    }

    const rows = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_primaryKeyNorm", (q: any) =>
        q
          .eq("snapshotId", snapshot._id)
          .eq("buildId", buildId)
          .eq("primaryKeyNorm", args.primaryKeyNorm),
      )
      .take(5);

    if (rows.length === 0) {
      return null;
    }

    if (rows.length > 1) {
      const secondaryKeys = rows
        .map((row: any) => row.secondaryKey)
        .filter((value: any) => value !== undefined && value !== null);
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          `Secondary key required for ${args.primaryKeyNorm}. ` +
          `Available secondary keys: ${secondaryKeys.join(", ")}`,
      });
    }

    const row = rows[0];
    return {
      snapshot: snapshotRef,
      row: {
        rowIndex: row.rowIndex,
        primaryKey: row.primaryKey,
        primaryKeyNorm: row.primaryKeyNorm,
        secondaryKey: row.secondaryKey ?? null,
        metrics: row.metrics,
      },
    };
  },
});
