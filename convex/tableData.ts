import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const requireSyncToken = (syncToken: string | undefined) => {
  const expected = process.env.DAMODARAN_SYNC_TOKEN;
  if (!expected) {
    throw new Error("Missing DAMODARAN_SYNC_TOKEN");
  }
  if (!syncToken || syncToken !== expected) {
    throw new Error("Invalid sync token");
  }
};

export const insertBatch = mutation({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
    rows: v.array(
      v.object({
        rowIndex: v.number(),
        primaryKey: v.string(),
        secondaryKey: v.optional(v.string()),
        metrics: v.any(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    if (args.rows.length > 100) {
      throw new Error("Batch too large: max 100 rows per call");
    }

    await Promise.all(
      args.rows.map((row) =>
        ctx.db.insert("tableData", {
          snapshotId: args.snapshotId,
          buildId: args.buildId,
          rowIndex: row.rowIndex,
          primaryKey: row.primaryKey,
          secondaryKey: row.secondaryKey,
          metrics: row.metrics,
        }),
      ),
    );

    return { inserted: args.rows.length };
  },
});

export const deleteBySnapshotBuild = mutation({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    if (
      !Number.isInteger(args.limit) ||
      args.limit <= 0 ||
      args.limit > 1000
    ) {
      throw new Error("Limit must be an integer between 1 and 1000");
    }

    const rows = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q.eq("snapshotId", args.snapshotId).eq("buildId", args.buildId),
      )
      .take(args.limit);

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    return { deleted: rows.length };
  },
});

export const listBySnapshot = query({
  args: {
    snapshotId: v.id("snapshots"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot || !snapshot.activeBuildId) {
      return { rows: [], nextCursor: null };
    }

    const limit = args.limit ?? 100;
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q
          .eq("snapshotId", args.snapshotId)
          .eq("buildId", snapshot.activeBuildId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    return {
      rows: result.page,
      nextCursor: result.continueCursor ?? null,
    };
  },
});
