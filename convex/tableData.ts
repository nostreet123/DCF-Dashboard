import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const normalizePrimaryKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getMaxInsertRowsPerCall = () => {
  const raw = process.env.TABLEDATA_INSERT_MAX_ROWS;
  if (!raw) {
    return 100;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  const floored = Math.floor(parsed);
  if (floored <= 0) {
    return 100;
  }
  // Keep headroom for other IO ops within this mutation.
  return Math.min(900, floored);
};

const tableDataValidator = v.object({
  _id: v.id("tableData"),
  _creationTime: v.number(),
  snapshotId: v.id("snapshots"),
  buildId: v.string(),
  rowIndex: v.number(),
  primaryKey: v.string(),
  primaryKeyNorm: v.string(),
  secondaryKey: v.optional(v.string()),
  metrics: v.any(),
});

export const insertBatch = mutation({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
    rows: v.array(
      v.object({
        rowIndex: v.number(),
        primaryKey: v.string(),
        primaryKeyNorm: v.string(),
        secondaryKey: v.optional(v.string()),
        metrics: v.any(),
      }),
    ),
  },
  returns: v.object({
    inserted: v.number(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const maxRows = getMaxInsertRowsPerCall();
    if (args.rows.length > maxRows) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Batch too large: max ${maxRows} rows per call`,
      });
    }

    for (const row of args.rows) {
      const primaryKeyNorm = normalizePrimaryKey(row.primaryKey);
      if (row.primaryKeyNorm !== primaryKeyNorm) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `primaryKeyNorm mismatch at row ${row.rowIndex}: expected ${primaryKeyNorm}`,
        });
      }
      await ctx.db.insert("tableData", {
        snapshotId: args.snapshotId,
        buildId: args.buildId,
        rowIndex: row.rowIndex,
        primaryKey: row.primaryKey,
        primaryKeyNorm,
        secondaryKey: row.secondaryKey,
        metrics: row.metrics,
      });
    }

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
  returns: v.object({
    deleted: v.number(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    if (
      !Number.isInteger(args.limit) ||
      args.limit <= 0 ||
      args.limit > 1000
    ) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Limit must be an integer between 1 and 1000",
      });
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
  returns: v.object({
    rows: v.array(tableDataValidator),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.get(args.snapshotId);
    const activeBuildId = snapshot?.activeBuildId;
    if (!activeBuildId) {
      return { rows: [], nextCursor: null };
    }

    const limit = args.limit ?? 100;
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q.eq("snapshotId", args.snapshotId).eq("buildId", activeBuildId),
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

export const deleteNonActiveRowsPage = mutation({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    activeBuildId: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = args.limit ?? 500;
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q.eq("snapshotId", args.snapshotId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    let deleted = 0;
    for (const row of result.page) {
      if (row.buildId !== args.activeBuildId) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    return {
      deleted,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const backfillPrimaryKeyNormPage = mutation({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    updated: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = args.limit ?? 500;
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q.eq("snapshotId", args.snapshotId).eq("buildId", args.buildId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    let updated = 0;
    for (const row of result.page) {
      if (row.primaryKeyNorm) {
        continue;
      }
      const normalized = normalizePrimaryKey(row.primaryKey);
      await ctx.db.patch(row._id, { primaryKeyNorm: normalized });
      updated += 1;
    }

    return {
      updated,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const backfillMissingPrimaryKeyNormPage = mutation({
  args: {
    syncToken: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    updated: v.number(),
    nextCursor: v.union(v.string(), v.null()),
    seenSnapshots: v.array(
      v.object({
        snapshotId: v.id("snapshots"),
        buildId: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = args.limit ?? 500;
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) => q)
      .paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    let updated = 0;
    const seenSnapshots = new Map<string, { snapshotId: any; buildId: string }>();
    for (const row of result.page) {
      const snapshotKey = `${row.snapshotId}:${row.buildId}`;
      if (!seenSnapshots.has(snapshotKey)) {
        seenSnapshots.set(snapshotKey, {
          snapshotId: row.snapshotId,
          buildId: row.buildId,
        });
      }
      if (row.primaryKeyNorm) {
        continue;
      }
      const normalized = normalizePrimaryKey(row.primaryKey);
      await ctx.db.patch(row._id, { primaryKeyNorm: normalized });
      updated += 1;
    }

    return {
      updated,
      nextCursor: result.continueCursor ?? null,
      seenSnapshots: Array.from(seenSnapshots.values()),
    };
  },
});
