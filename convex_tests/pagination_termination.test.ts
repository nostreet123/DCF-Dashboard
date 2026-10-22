/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import * as companies from "../convex/companies";
import * as statements from "../convex/companyStatements";
import * as snapshots from "../convex/snapshots";
import * as tableData from "../convex/tableData";
import * as backfill from "../convex/maintenance/backfill";
import * as cleanup from "../convex/maintenance/duplicateCleanup";
import * as scan from "../convex/maintenance/duplicateScan";

const token = "pagination-regression-token";
const originalToken = process.env.DAMODARAN_SYNC_TOKEN;
beforeEach(() => { process.env.DAMODARAN_SYNC_TOKEN = token; });
afterEach(() => {
  if (originalToken === undefined) delete process.env.DAMODARAN_SYNC_TOKEN;
  else process.env.DAMODARAN_SYNC_TOKEN = originalToken;
});

// Mock only the database pagination boundary. Both fields reflect the Convex
// contract: an exhausted page may still carry a nonempty continuation cursor.
const pageContext = (isDone: boolean) => {
  const chain: any = {
    withIndex: () => chain,
    order: () => chain,
    paginate: async () => ({ page: [], isDone, continueCursor: "opaque-cursor" }),
  };
  return { db: {
    query: () => chain,
    get: async () => ({ activeBuildId: "active" }),
  } };
};
const invoke = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);

const pageAdapters = [
  ["company statements", statements.listBySymbol, { symbol: "ABC" }],
  ["company search backfill", companies.backfillSearchTextPage, {}],
  ["snapshot listing", snapshots.listByDatasetRegion, { datasetKey: "d", regionCode: "US" }],
  ["rebuilding snapshots", snapshots.listRebuilding, {}],
  ["active table rows", tableData.listBySnapshot, { snapshotId: "s" }],
  ["nonactive row deletion", tableData.deleteNonActiveRowsPage, { snapshotId: "s", activeBuildId: "active" }],
  ["row key backfill", tableData.backfillPrimaryKeyNormPage, { snapshotId: "s", buildId: "active" }],
  ["missing row key backfill", tableData.backfillMissingPrimaryKeyNormPage, {}],
  ["asset key backfill", backfill.backfillAssetKeysPage, { pageType: "current" }],
  ["snapshot duplicate scan", scan.findDuplicateSnapshotsPageInternal, {}],
  ["asset duplicate scan", scan.findDuplicateAssetsPageInternal, {}],
  ["snapshot groups", scan.listDuplicateSnapshotGroups, { scanId: "scan" }],
  ["asset groups", scan.listDuplicateAssetGroups, { scanId: "scan" }],
  ["cleanup snapshot groups", scan.listDuplicateSnapshotGroupsPageInternal, { scanId: "scan" }],
  ["cleanup asset groups", scan.listDuplicateAssetGroupsPageInternal, { scanId: "scan" }],
  ["snapshot row deletion", cleanup.deleteTableDataBySnapshotPageInternal, { snapshotId: "s" }],
] as const;

describe("pagination adapters", () => {
  for (const [name, fn, args] of pageAdapters) {
    test(`${name} returns null at exhaustion even with an opaque cursor`, async () => {
      const result = await invoke(fn, pageContext(true), { ...args, syncToken: token });
      expect(result.nextCursor).toBeNull();
    });
    test(`${name} retains a cursor for an empty nonterminal page`, async () => {
      const result = await invoke(fn, pageContext(false), { ...args, syncToken: token });
      expect(result.nextCursor).toBe("opaque-cursor");
    });
  }
});

// Use real child handlers, argument/schema/return validation and the test DB.
// Control only the scheduler so an accidental infinite chain fails after a
// bounded number of chunks. convex-test 0.0.59 provides stable deletion cursors.
const modules: Record<string, () => Promise<any>> = {};
const convexDir = `${import.meta.dir}/../convex`;
for (const entry of new Bun.Glob("**/*.ts").scanSync({ cwd: convexDir })) {
  modules[`../convex/${entry}`] = () => import(`${convexDir}/${entry}`);
}
const newDb = () => convexTest(schema, modules);
type TestDb = ReturnType<typeof newDb>;

const seedScan = async (t: TestDb, status: "running" | "complete", pageLimit = 1) => t.run(async (ctx) =>
  ctx.db.insert("duplicateScanState", {
    key: "default", status, phase: "snapshots", pageLimit, runId: "pagination-run",
    snapshotPagesScanned: 0, assetPagesScanned: 0, snapshotDuplicateGroups: 0,
    assetDuplicateGroups: 0, startedAt: 1, updatedAt: 1,
  }),
);
const seedPairs = async (t: TestDb, groupCount: number) => t.run(async (ctx) => {
  const snapshotPairs = [];
  const assetPairs = [];
  for (let group = 0; group < groupCount; group++) {
    const snapshotIds = [];
    const assetIds = [];
    for (let index = 0; index < 2; index++) {
      const snapshotId = await ctx.db.insert("snapshots", {
        datasetKey: `dataset-${group}`, regionCode: "US", asOfDate: "2026-01-01",
        asOfDateSource: "label", asOfGranularity: "day", sourcePageUrl: "https://example.com/",
        sourceUrl: "https://example.com/data.xls", fileName: "data.xls", linkLabel: "Data",
        pageType: "current", fileHash: "hash", dataStatus: "ready", activeBuildId: "active",
        storageType: "convex", sheetName: "Data", headerRow: 0, columnNames: ["Industry"],
        metricsKeys: [], rowCount: 3, dataType: "industry", sheetCandidates: ["Data"],
        skippedSheets: [], downloadedAt: index + 1, parsedAt: index + 1,
      });
      snapshotIds.push(snapshotId);
      for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
        await ctx.db.insert("tableData", {
          snapshotId, buildId: "active", rowIndex, primaryKey: `row-${rowIndex}`,
          primaryKeyNorm: `row ${rowIndex}`, metrics: {},
        });
      }
      assetIds.push(await ctx.db.insert("assets", {
        sourcePageUrl: "https://example.com/", pageType: "current", sourceUrl: "https://example.com/data.xls",
        fileName: "data.xls", linkLabel: "Data", resolved: false,
        assetKey: `asset-${group}`, discoveredAt: index + 1,
      }));
    }
    snapshotPairs.push(snapshotIds);
    assetPairs.push(assetIds);
  }
  return { snapshotPairs, assetPairs };
});

for (const kind of ["snapshots", "assets"] as const) {
  for (const visibility of ["public", "internal"] as const) {
    test(`${visibility} ${kind} group listing accepts populated documents with system fields`, async () => {
      const t = newDb();
      const scanId = await seedScan(t, "complete");
      const { snapshotPairs, assetPairs } = await seedPairs(t, 1);
      const groupId = await t.run(async (ctx) => kind === "snapshots"
        ? await ctx.db.insert("duplicateSnapshotGroups", {
          scanId, datasetKey: "dataset-0", regionCode: "US", asOfDate: "2026-01-01",
          count: 2, ids: snapshotPairs[0], createdAt: 1,
        })
        : await ctx.db.insert("duplicateAssetGroups", {
          scanId, assetKey: "asset-0", count: 2, ids: assetPairs[0], createdAt: 1,
        }));
      const fn = kind === "snapshots"
        ? visibility === "public" ? api.maintenance.listDuplicateSnapshotGroups : internal.maintenance.listDuplicateSnapshotGroupsPageInternal
        : visibility === "public" ? api.maintenance.listDuplicateAssetGroups : internal.maintenance.listDuplicateAssetGroupsPageInternal;
      const page = await t.query(fn, visibility === "public" ? { scanId, syncToken: token } : { scanId });
      expect(page.groups).toHaveLength(1);
      expect(page.groups[0]).toMatchObject({ _id: groupId, _creationTime: expect.any(Number), count: 2 });
      expect(page.nextCursor).toBeNull();
    });
  }
}

const actionContext = (t: TestDb) => {
  let scheduled = 0;
  return {
    context: {
      runQuery: (fn: any, args: any) => t.query(fn, args),
      runMutation: (fn: any, args: any) => t.mutation(fn, args),
      scheduler: { runAfter: async () => { scheduled++; } },
    },
    scheduled: () => scheduled,
  };
};

for (const pageLimit of [1, 2, 10]) {
  test(`scan flushes final duplicate carry and completes at page limit ${pageLimit}`, async () => {
    const t = newDb();
    const stateId = await seedScan(t, "running", pageLimit);
    await seedPairs(t, 2);
    const action = actionContext(t);
    let state;
    for (let chunks = 0; chunks < 20; chunks++) {
      await invoke(scan.runDuplicateScanChunk, action.context, { stateId, runId: "pagination-run" });
      state = await t.query(internal.maintenance.getDuplicateScanStateInternal, { stateId });
      if (state?.status !== "running") break;
    }
    expect(state?.status).toBe("complete");
    expect(state?.snapshotDuplicateGroups).toBe(2);
    expect(state?.assetDuplicateGroups).toBe(2);
    expect(state?.snapshotCarry).toBeUndefined();
    expect(state?.assetCarry).toBeUndefined();
    const before = action.scheduled();
    await invoke(scan.runDuplicateScanChunk, action.context, { stateId, runId: "pagination-run" });
    expect(action.scheduled()).toBe(before);
  });
}

test("empty scan reaches complete without scheduling empty pages indefinitely", async () => {
  const t = newDb();
  const stateId = await seedScan(t, "running");
  const action = actionContext(t);
  await invoke(scan.runDuplicateScanChunk, action.context, { stateId, runId: "pagination-run" });
  expect((await t.query(internal.maintenance.getDuplicateScanStateInternal, { stateId }))?.phase).toBe("assets");
  await invoke(scan.runDuplicateScanChunk, action.context, { stateId, runId: "pagination-run" });
  expect((await t.query(internal.maintenance.getDuplicateScanStateInternal, { stateId }))?.status).toBe("complete");
  expect(action.scheduled()).toBe(1);
});

for (const dryRun of [true, false]) {
  for (const groupCount of [1, 2]) {
    test(`cleanup ${dryRun ? "dry-run" : "deletion"} processes ${groupCount} groups once and completes`, async () => {
      const t = newDb();
      const scanId = await seedScan(t, "complete");
      const { snapshotPairs, assetPairs } = await seedPairs(t, groupCount);
      const stateId = await t.run(async (ctx) => {
        for (let group = 0; group < groupCount; group++) {
          await ctx.db.insert("duplicateSnapshotGroups", {
            scanId, datasetKey: `dataset-${group}`, regionCode: "US", asOfDate: "2026-01-01",
            count: 2, ids: snapshotPairs[group], createdAt: 1,
          });
          await ctx.db.insert("duplicateAssetGroups", {
            scanId, assetKey: `asset-${group}`, count: 2, ids: assetPairs[group], createdAt: 1,
          });
        }
        return ctx.db.insert("duplicateCleanupState", {
          key: "default", status: "running", phase: "snapshots", scanId, dryRun,
          pageLimit: 2, snapshotGroupsProcessed: 0, snapshotsDeleted: 0, tableRowsDeleted: 0,
          assetGroupsProcessed: 0, assetsDeleted: 0, startedAt: 1, updatedAt: 1,
        });
      });
      const action = actionContext(t);
      let state;
      for (let chunks = 0; chunks < 30; chunks++) {
        await invoke(cleanup.runDuplicateCleanupChunk, action.context, { stateId });
        state = await t.query(internal.maintenance.getDuplicateCleanupStateInternal, { stateId });
        if (state?.status !== "running") break;
      }
      expect(state?.status).toBe("complete");
      expect(state?.snapshotGroupsProcessed).toBe(groupCount);
      expect(state?.assetGroupsProcessed).toBe(groupCount);
      expect(state?.snapshotsDeleted).toBe(groupCount);
      expect(state?.assetsDeleted).toBe(groupCount);
      expect(state?.tableRowsDeleted).toBe(dryRun ? 0 : groupCount * 3);
      const counts = await t.run(async (ctx) => ({
        snapshots: (await ctx.db.query("snapshots").collect()).length,
        assets: (await ctx.db.query("assets").collect()).length,
        rows: (await ctx.db.query("tableData").collect()).length,
        snapshotGroups: (await ctx.db.query("duplicateSnapshotGroups").collect()).length,
        assetGroups: (await ctx.db.query("duplicateAssetGroups").collect()).length,
      }));
      expect(counts).toEqual({
        snapshots: groupCount * (dryRun ? 2 : 1), assets: groupCount * (dryRun ? 2 : 1),
        rows: groupCount * (dryRun ? 6 : 3), snapshotGroups: dryRun ? groupCount : 0,
        assetGroups: dryRun ? groupCount : 0,
      });
      for (const ids of [...snapshotPairs, ...assetPairs]) {
        expect(await t.run((ctx) => ctx.db.get(ids[1]))).not.toBeNull();
      }
      const before = action.scheduled();
      await invoke(cleanup.runDuplicateCleanupChunk, action.context, { stateId });
      expect(action.scheduled()).toBe(before);
    });
  }
}

for (const phase of ["snapshots", "assets"] as const) {
  test(`cleanup continues past an empty nonterminal ${phase} group page`, async () => {
    const t = newDb();
    const scanId = await seedScan(t, "complete");
    const stateId = await t.run((ctx) => ctx.db.insert("duplicateCleanupState", {
      key: "default", status: "running", phase, scanId, dryRun: true,
      pageLimit: 2, snapshotGroupsProcessed: 0, snapshotsDeleted: 0, tableRowsDeleted: 0,
      assetGroupsProcessed: 0, assetsDeleted: 0, startedAt: 1, updatedAt: 1,
    }));
    const action = actionContext(t);
    const context = {
      ...action.context,
      runQuery: (fn: any, args: any) => getFunctionName(fn).endsWith("GroupsPageInternal")
        ? Promise.resolve({ groups: [], nextCursor: "next-group-page" })
        : action.context.runQuery(fn, args),
    };
    await invoke(cleanup.runDuplicateCleanupChunk, context, { stateId });
    const state = await t.query(internal.maintenance.getDuplicateCleanupStateInternal, { stateId });
    expect(state).toMatchObject({ status: "running", phase, groupCursor: "next-group-page" });
    expect(action.scheduled()).toBe(1);
  });
}

test("stale scan jobs cannot clear the current run's pagination state", async () => {
  const t = newDb();
  const stateId = await seedScan(t, "running");
  await t.run((ctx) => ctx.db.patch(stateId, { snapshotCursor: "current-run-cursor" }));
  await t.mutation(internal.maintenance.updateDuplicateScanStateInternal, {
    stateId, runId: "stale-run", patch: { status: "complete" }, clearFields: ["snapshotCursor"],
  });
  expect(await t.query(internal.maintenance.getDuplicateScanStateInternal, { stateId })).toMatchObject({
    status: "running", snapshotCursor: "current-run-cursor",
  });
  const action = actionContext(t);
  await invoke(scan.runDuplicateScanChunk, action.context, { stateId, runId: "stale-run" });
  expect(action.scheduled()).toBe(0);
});
