import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { normalizePositiveIntegerLimit } from "./normalization";
import { requireSyncToken } from "./syncAuth";

const normalizePrimaryKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizePageLimit = (
  requested: number | undefined,
  defaultLimit: number,
  maxLimit: number,
) => normalizePositiveIntegerLimit(requested, defaultLimit, maxLimit);

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

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
  return `{${entries.join(",")}}`;
};

const logAudit = async (
  ctx: MutationCtx,
  action: string,
  details: Record<string, unknown>,
) => {
  await ctx.db.insert("auditLogs", {
    action,
    source: "sync",
    createdAt: Date.now(),
    details,
  });
};

const TableDataRow = v.object({
  _id: v.id("tableData"),
  _creationTime: v.number(),
  snapshotId: v.id("snapshots"),
  buildId: v.string(),
  rowIndex: v.number(),
  primaryKey: v.string(),
  primaryKeyNorm: v.string(),
  secondaryKey: v.optional(v.string()),
  metrics: v.record(v.string(), v.any()),
});

type InsertBatchRow = {
  rowIndex: number;
  primaryKey: string;
  primaryKeyNorm: string;
  secondaryKey?: string;
  metrics: Record<string, unknown>;
};

const assertInsertBatchSize = (rows: InsertBatchRow[], maxRows: number) => {
  if (rows.length > maxRows) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `Batch too large: max ${maxRows} rows per call`,
    });
  }
};

const validatedPrimaryKeyNorm = (row: InsertBatchRow) => {
  const primaryKeyNorm = normalizePrimaryKey(row.primaryKey);
  if (row.primaryKeyNorm !== primaryKeyNorm) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message:
        `primaryKeyNorm mismatch at row ${row.rowIndex}: ` +
        `expected ${primaryKeyNorm}`,
    });
  }
  return primaryKeyNorm;
};

const queryRowsBySnapshotBuildAndIndex = (
  ctx: MutationCtx,
  snapshotId: any,
  buildId: string,
  rowIndex: number,
) =>
  ctx.db.query("tableData").withIndex("by_snapshot_build_rowIndex", (q) =>
    q.eq("snapshotId", snapshotId).eq("buildId", buildId).eq("rowIndex", rowIndex),
  );

const listExistingRowsForRow = async (
  ctx: MutationCtx,
  snapshotId: any,
  buildId: string,
  rowIndex: number,
) => {
  const matches = await queryRowsBySnapshotBuildAndIndex(
    ctx,
    snapshotId,
    buildId,
    rowIndex,
  ).take(2);
  if (matches.length <= 1) {
    return matches;
  }
  return await queryRowsBySnapshotBuildAndIndex(
    ctx,
    snapshotId,
    buildId,
    rowIndex,
  ).collect();
};

const isEquivalentRow = (
  existing: any,
  row: InsertBatchRow,
  primaryKeyNorm: string,
  rowMetricsJson: string,
) => {
  const sameSecondaryKey = (existing.secondaryKey ?? null) === (row.secondaryKey ?? null);
  const sameMetrics = stableStringify(existing.metrics) === rowMetricsJson;
  return (
    existing.primaryKey === row.primaryKey &&
    existing.primaryKeyNorm === primaryKeyNorm &&
    sameSecondaryKey &&
    sameMetrics
  );
};

const hasEquivalentExistingRows = async (
  ctx: MutationCtx,
  snapshotId: any,
  buildId: string,
  row: InsertBatchRow,
  primaryKeyNorm: string,
) => {
  const existingRows = await listExistingRowsForRow(
    ctx,
    snapshotId,
    buildId,
    row.rowIndex,
  );
  if (existingRows.length === 0) {
    return false;
  }
  const rowMetricsJson = stableStringify(row.metrics);
  if (
    !existingRows.every((existing: any) =>
      isEquivalentRow(existing, row, primaryKeyNorm, rowMetricsJson),
    )
  ) {
    throw new ConvexError({
      code: "CONFLICT",
      message: `Row ${row.rowIndex} already exists with different data`,
    });
  }
  return true;
};

const insertTableDataRow = async (
  ctx: MutationCtx,
  snapshotId: any,
  buildId: string,
  row: InsertBatchRow,
  primaryKeyNorm: string,
) => {
  await ctx.db.insert("tableData", {
    snapshotId,
    buildId,
    rowIndex: row.rowIndex,
    primaryKey: row.primaryKey,
    primaryKeyNorm,
    secondaryKey: row.secondaryKey,
    metrics: row.metrics,
  });
};

const processInsertBatchRow = async (
  ctx: MutationCtx,
  snapshotId: any,
  buildId: string,
  row: InsertBatchRow,
) => {
  const primaryKeyNorm = validatedPrimaryKeyNorm(row);
  const exists = await hasEquivalentExistingRows(
    ctx,
    snapshotId,
    buildId,
    row,
    primaryKeyNorm,
  );
  if (exists) {
    return false;
  }
  await insertTableDataRow(ctx, snapshotId, buildId, row, primaryKeyNorm);
  return true;
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
        primaryKeyNorm: v.string(),
        secondaryKey: v.optional(v.string()),
        metrics: v.record(v.string(), v.any()),
      }),
    ),
  },
  returns: v.object({
    inserted: v.number(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const maxRows = getMaxInsertRowsPerCall();
    assertInsertBatchSize(args.rows as InsertBatchRow[], maxRows);

    let inserted = 0;
    for (const row of args.rows) {
      const didInsert = await processInsertBatchRow(
        ctx,
        args.snapshotId,
        args.buildId,
        row as InsertBatchRow,
      );
      if (didInsert) {
        inserted += 1;
      }
    }

    return { inserted };
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

    await Promise.all(
      rows.map(row => ctx.db.delete(row._id))
    );

    await logAudit(ctx, "tableData.deleteBySnapshotBuild", {
      snapshotId: args.snapshotId,
      buildId: args.buildId,
      deleted: rows.length,
    });

    return { deleted: rows.length };
  },
});

export const listBySnapshot = query({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    rows: v.array(TableDataRow),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const snapshot = await ctx.db.get(args.snapshotId);
    const activeBuildId = snapshot?.activeBuildId;
    if (!snapshot || !activeBuildId) {
      return { rows: [], nextCursor: null };
    }

    const limit = normalizePageLimit(args.limit, 100, 500);
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q
          .eq("snapshotId", args.snapshotId)
          .eq("buildId", activeBuildId),
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
    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Snapshot not found",
      });
    }
    if (!snapshot.activeBuildId) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Snapshot has no active build",
      });
    }
    if (snapshot.activeBuildId !== args.activeBuildId) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Active build ID does not match",
      });
    }

    const limit = normalizePageLimit(args.limit, 500, 1000);
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q.eq("snapshotId", args.snapshotId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const toDelete = result.page.filter((row) => row.buildId !== args.activeBuildId);
    await Promise.all(toDelete.map((row) => ctx.db.delete(row._id)));
    const deleted = toDelete.length;

    if (deleted > 0) {
      await logAudit(ctx, "tableData.deleteNonActiveRowsPage", {
        snapshotId: args.snapshotId,
        activeBuildId: args.activeBuildId,
        deleted,
      });
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
    const limit = normalizePageLimit(args.limit, 500, 1000);
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q.eq("snapshotId", args.snapshotId).eq("buildId", args.buildId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const rowsToUpdate = result.page.filter(row => !row.primaryKeyNorm);

    await Promise.all(
      rowsToUpdate.map(row => {
        const normalized = normalizePrimaryKey(row.primaryKey);
        return ctx.db.patch(row._id, { primaryKeyNorm: normalized });
      })
    );

    const updated = rowsToUpdate.length;

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
    const limit = normalizePageLimit(args.limit, 500, 1000);
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) => q)
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const seenSnapshots = new Map<string, { snapshotId: any; buildId: string }>();
    const rowsToUpdate = [];

    for (const row of result.page) {
      const snapshotKey = `${row.snapshotId}:${row.buildId}`;
      if (!seenSnapshots.has(snapshotKey)) {
        seenSnapshots.set(snapshotKey, {
          snapshotId: row.snapshotId,
          buildId: row.buildId,
        });
      }
      if (!row.primaryKeyNorm) {
        rowsToUpdate.push(row);
      }
    }

    await Promise.all(
      rowsToUpdate.map(row => {
        const normalized = normalizePrimaryKey(row.primaryKey);
        return ctx.db.patch(row._id, { primaryKeyNorm: normalized });
      })
    );

    const updated = rowsToUpdate.length;

    return {
      updated,
      nextCursor: result.continueCursor ?? null,
      seenSnapshots: Array.from(seenSnapshots.values()),
    };
  },
});
