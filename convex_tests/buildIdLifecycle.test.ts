/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// ---------------------------------------------------------------------------
// Module map for convex-test (Bun does not support import.meta.glob)
// ---------------------------------------------------------------------------
const modules: Record<string, () => Promise<any>> = {};
const glob = new Bun.Glob("**/*.ts");
const convexDir = `${import.meta.dir}/../convex`;
for (const entry of glob.scanSync({ cwd: convexDir, absolute: false })) {
  const key = `../convex/${entry}`;
  const fullPath = `${convexDir}/${entry}`;
  modules[key] = () => import(fullPath);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TEST_SYNC_TOKEN = "test-sync-token-for-build-id-lifecycle";

const makeMetadata = (overrides: Record<string, unknown> = {}) => ({
  asOfDateSource: "label" as const,
  asOfGranularity: "day" as const,
  sourcePageUrl: "https://example.com/page",
  sourceUrl: "https://example.com/file.xls",
  fileName: "file.xls",
  linkLabel: "Test File",
  pageType: "current" as const,
  fileHash: "hash-v1",
  storageType: "convex" as const,
  sheetName: "Sheet1",
  headerRow: 0,
  columnNames: ["industry", "value"],
  metricsKeys: ["value"],
  rowCount: 2,
  dataType: "industry" as const,
  sheetCandidates: ["Sheet1"],
  skippedSheets: [],
  downloadedAt: 1000,
  parsedAt: 2000,
  ...overrides,
});

const makeRows = (buildId: string, prefix = "row") => [
  {
    rowIndex: 0,
    primaryKey: `${prefix}-A`,
    primaryKeyNorm: `${prefix} a`,
    metrics: { value: 100 },
  },
  {
    rowIndex: 1,
    primaryKey: `${prefix}-B`,
    primaryKeyNorm: `${prefix} b`,
    metrics: { value: 200 },
  },
];

// ---------------------------------------------------------------------------
// Env setup / teardown
// ---------------------------------------------------------------------------
const originalToken = process.env.DAMODARAN_SYNC_TOKEN;

beforeEach(() => {
  process.env.DAMODARAN_SYNC_TOKEN = TEST_SYNC_TOKEN;
});

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.DAMODARAN_SYNC_TOKEN;
  } else {
    process.env.DAMODARAN_SYNC_TOKEN = originalToken;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Build ID lifecycle", () => {
  test("happy path: upsert → insertBatch → finalize → listBySnapshot", async () => {
    const t = convexTest(schema, modules);

    // Step 1: Upsert creates a new snapshot in "rebuilding" state
    const upsertResult = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-test",
      regionCode: "US",
      asOfDate: "2025-01-01",
      buildId: "build-001",
      metadata: makeMetadata(),
    });

    expect(upsertResult.action).toBe("created");
    const snapshotId = upsertResult.snapshotId;

    // Verify snapshot is in rebuilding state
    const snapshotBeforeFinalize = await t.query(api.snapshots.getByIdentity, {
      datasetKey: "ds-test",
      regionCode: "US",
      asOfDate: "2025-01-01",
    });
    expect(snapshotBeforeFinalize).not.toBeNull();
    expect(snapshotBeforeFinalize!.dataStatus).toBe("rebuilding");
    expect(snapshotBeforeFinalize!.pendingBuildId).toBe("build-001");
    expect(snapshotBeforeFinalize!.activeBuildId).toBeUndefined();

    // Step 2: Insert rows tagged with the buildId
    const insertResult = await t.mutation(api.tableData.insertBatch, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
      buildId: "build-001",
      rows: makeRows("build-001"),
    });
    expect(insertResult.inserted).toBe(2);

    // Before finalize, listBySnapshot should return nothing (no activeBuildId yet)
    const beforeFinalizeList = await t.query(api.tableData.listBySnapshot, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
    });
    expect(beforeFinalizeList.rows).toHaveLength(0);

    // Step 3: Finalize — promotes pendingBuildId → activeBuildId
    await t.mutation(api.snapshots.finalizeRebuild, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
      buildId: "build-001",
      metadata: makeMetadata(),
    });

    // Verify snapshot is now "ready" with activeBuildId
    const snapshotAfterFinalize = await t.query(api.snapshots.getByIdentity, {
      datasetKey: "ds-test",
      regionCode: "US",
      asOfDate: "2025-01-01",
    });
    expect(snapshotAfterFinalize!.dataStatus).toBe("ready");
    expect(snapshotAfterFinalize!.activeBuildId).toBe("build-001");
    expect(snapshotAfterFinalize!.pendingBuildId).toBeUndefined();

    // Step 4: listBySnapshot should now return the 2 rows
    const afterFinalizeList = await t.query(api.tableData.listBySnapshot, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
    });
    expect(afterFinalizeList.rows).toHaveLength(2);
    expect(afterFinalizeList.rows[0].primaryKey).toBe("row-A");
    expect(afterFinalizeList.rows[1].primaryKey).toBe("row-B");
  });

  test("insertBatch treats reordered metrics as equivalent but rejects escaped-key collisions", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-metrics-collision",
      regionCode: "US",
      asOfDate: "2025-01-15",
      buildId: "build-metrics-001",
      metadata: makeMetadata(),
    });

    const baseRow = {
      rowIndex: 0,
      primaryKey: "row-collision",
      primaryKeyNorm: "row collision",
    };

    const initialInsert = await t.mutation(api.tableData.insertBatch, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId: created.snapshotId,
      buildId: "build-metrics-001",
      rows: [
        {
          ...baseRow,
          metrics: { b: 2, a: 1 },
        },
      ],
    });
    expect(initialInsert.inserted).toBe(1);

    const equivalentInsert = await t.mutation(api.tableData.insertBatch, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId: created.snapshotId,
      buildId: "build-metrics-001",
      rows: [
        {
          ...baseRow,
          metrics: { a: 1, b: 2 },
        },
      ],
    });
    expect(equivalentInsert.inserted).toBe(0);

    await expect(
      t.mutation(api.tableData.insertBatch, {
        syncToken: TEST_SYNC_TOKEN,
        snapshotId: created.snapshotId,
        buildId: "build-metrics-001",
        rows: [
          {
            ...baseRow,
            metrics: { 'a":1,"b': 2 },
          },
        ],
      }),
    ).rejects.toThrow("Row 0 already exists with different data");
  });

  test("rebuild path: new fileHash triggers rebuild, old rows are replaceable", async () => {
    const t = convexTest(schema, modules);

    // --- Initial build ---
    const initial = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-rebuild",
      regionCode: "US",
      asOfDate: "2025-02-01",
      buildId: "build-100",
      metadata: makeMetadata({ fileHash: "hash-v1" }),
    });
    expect(initial.action).toBe("created");
    const snapshotId = initial.snapshotId;

    await t.mutation(api.tableData.insertBatch, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
      buildId: "build-100",
      rows: makeRows("build-100", "old"),
    });

    await t.mutation(api.snapshots.finalizeRebuild, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
      buildId: "build-100",
      metadata: makeMetadata({ fileHash: "hash-v1" }),
    });

    // Verify initial state
    const afterInitial = await t.query(api.tableData.listBySnapshot, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
    });
    expect(afterInitial.rows).toHaveLength(2);
    expect(afterInitial.rows[0].primaryKey).toBe("old-A");

    // --- Rebuild with new fileHash ---
    const rebuild = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-rebuild",
      regionCode: "US",
      asOfDate: "2025-02-01",
      buildId: "build-200",
      metadata: makeMetadata({ fileHash: "hash-v2" }),
    });
    expect(rebuild.action).toBe("updated");
    expect(rebuild.previousBuildId).toBe("build-100");

    // Insert new rows for the rebuild
    await t.mutation(api.tableData.insertBatch, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
      buildId: "build-200",
      rows: makeRows("build-200", "new"),
    });

    // During rebuild, readers still see old data (activeBuildId is still build-100)
    const duringRebuild = await t.query(api.tableData.listBySnapshot, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
    });
    expect(duringRebuild.rows).toHaveLength(2);
    expect(duringRebuild.rows[0].primaryKey).toBe("old-A");

    // Finalize the rebuild
    await t.mutation(api.snapshots.finalizeRebuild, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
      buildId: "build-200",
      metadata: makeMetadata({ fileHash: "hash-v2" }),
    });

    // After finalize, readers see the new data
    const afterRebuild = await t.query(api.tableData.listBySnapshot, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
    });
    expect(afterRebuild.rows).toHaveLength(2);
    expect(afterRebuild.rows[0].primaryKey).toBe("new-A");

    // Clean up old rows
    const deleteResult = await t.mutation(api.tableData.deleteBySnapshotBuild, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId,
      buildId: "build-100",
      limit: 100,
    });
    expect(deleteResult.deleted).toBe(2);

    // Verify the snapshot tracks previous hashes
    const finalSnapshot = await t.query(api.snapshots.getByIdentity, {
      datasetKey: "ds-rebuild",
      regionCode: "US",
      asOfDate: "2025-02-01",
    });
    expect(finalSnapshot!.fileHash).toBe("hash-v2");
    expect(finalSnapshot!.previousFileHashes).toContain("hash-v1");
  });

  test("unchanged path: same fileHash returns 'unchanged', no rebuild", async () => {
    const t = convexTest(schema, modules);

    // Create and finalize a snapshot
    const created = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-unchanged",
      regionCode: "EU",
      asOfDate: "2025-03-01",
      buildId: "build-300",
      metadata: makeMetadata({ fileHash: "stable-hash" }),
    });
    expect(created.action).toBe("created");

    await t.mutation(api.snapshots.finalizeRebuild, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId: created.snapshotId,
      buildId: "build-300",
      metadata: makeMetadata({ fileHash: "stable-hash" }),
    });

    // Upsert again with the same fileHash
    const unchanged = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-unchanged",
      regionCode: "EU",
      asOfDate: "2025-03-01",
      buildId: "build-301",
      metadata: makeMetadata({ fileHash: "stable-hash" }),
    });

    expect(unchanged.action).toBe("unchanged");
    expect(unchanged.snapshotId).toBe(created.snapshotId);

    // Snapshot should still be "ready", not "rebuilding"
    const snapshot = await t.query(api.snapshots.getByIdentity, {
      datasetKey: "ds-unchanged",
      regionCode: "EU",
      asOfDate: "2025-03-01",
    });
    expect(snapshot!.dataStatus).toBe("ready");
    expect(snapshot!.activeBuildId).toBe("build-300");
  });

  test("insertBatch rejects mismatched build IDs and inserts when snapshot is ready", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-build-guard",
      regionCode: "US",
      asOfDate: "2025-05-01",
      buildId: "build-guard-100",
      metadata: makeMetadata(),
    });

    await expect(
      t.mutation(api.tableData.insertBatch, {
        syncToken: TEST_SYNC_TOKEN,
        snapshotId: created.snapshotId,
        buildId: "build-guard-wrong",
        rows: makeRows("build-guard-wrong"),
      }),
    ).rejects.toThrow("Build ID does not match pending build");

    await t.mutation(api.tableData.insertBatch, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId: created.snapshotId,
      buildId: "build-guard-100",
      rows: makeRows("build-guard-100"),
    });

    await t.mutation(api.snapshots.finalizeRebuild, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId: created.snapshotId,
      buildId: "build-guard-100",
      metadata: makeMetadata(),
    });

    await expect(
      t.mutation(api.tableData.insertBatch, {
        syncToken: TEST_SYNC_TOKEN,
        snapshotId: created.snapshotId,
        buildId: "build-guard-100",
        rows: makeRows("build-guard-100"),
      }),
    ).rejects.toThrow("Snapshot is not rebuilding");
  });

  test("deleteBySnapshotBuild rejects active and pending builds", async () => {
    const t = convexTest(schema, modules);

    const created = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-delete-guard",
      regionCode: "US",
      asOfDate: "2025-06-01",
      buildId: "build-delete-100",
      metadata: makeMetadata(),
    });

    await t.mutation(api.tableData.insertBatch, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId: created.snapshotId,
      buildId: "build-delete-100",
      rows: makeRows("build-delete-100"),
    });

    await expect(
      t.mutation(api.tableData.deleteBySnapshotBuild, {
        syncToken: TEST_SYNC_TOKEN,
        snapshotId: created.snapshotId,
        buildId: "build-delete-100",
        limit: 100,
      }),
    ).rejects.toThrow("Cannot delete pending build");

    await t.mutation(api.snapshots.finalizeRebuild, {
      syncToken: TEST_SYNC_TOKEN,
      snapshotId: created.snapshotId,
      buildId: "build-delete-100",
      metadata: makeMetadata(),
    });

    await expect(
      t.mutation(api.tableData.deleteBySnapshotBuild, {
        syncToken: TEST_SYNC_TOKEN,
        snapshotId: created.snapshotId,
        buildId: "build-delete-100",
        limit: 100,
      }),
    ).rejects.toThrow("Cannot delete active build");
  });

  test("auth enforcement: mutations reject missing/invalid syncToken", async () => {
    const t = convexTest(schema, modules);

    // Create a snapshot first so we have a valid snapshotId for insertBatch
    const created = await t.mutation(api.snapshots.upsertByIdentity, {
      syncToken: TEST_SYNC_TOKEN,
      datasetKey: "ds-auth",
      regionCode: "US",
      asOfDate: "2025-04-01",
      buildId: "build-400",
      metadata: makeMetadata(),
    });

    // upsertByIdentity without syncToken
    await expect(
      t.mutation(api.snapshots.upsertByIdentity, {
        datasetKey: "ds-auth2",
        regionCode: "US",
        asOfDate: "2025-04-02",
        buildId: "build-401",
        metadata: makeMetadata(),
      }),
    ).rejects.toThrow("Invalid sync token");

    // upsertByIdentity with wrong syncToken
    await expect(
      t.mutation(api.snapshots.upsertByIdentity, {
        syncToken: "wrong-token",
        datasetKey: "ds-auth3",
        regionCode: "US",
        asOfDate: "2025-04-03",
        buildId: "build-402",
        metadata: makeMetadata(),
      }),
    ).rejects.toThrow("Invalid sync token");

    // insertBatch without syncToken
    await expect(
      t.mutation(api.tableData.insertBatch, {
        snapshotId: created.snapshotId,
        buildId: "build-400",
        rows: makeRows("build-400"),
      }),
    ).rejects.toThrow("Invalid sync token");

    // finalizeRebuild without syncToken
    await expect(
      t.mutation(api.snapshots.finalizeRebuild, {
        snapshotId: created.snapshotId,
        buildId: "build-400",
        metadata: makeMetadata(),
      }),
    ).rejects.toThrow("Invalid sync token");

    // deleteBySnapshotBuild without syncToken
    await expect(
      t.mutation(api.tableData.deleteBySnapshotBuild, {
        snapshotId: created.snapshotId,
        buildId: "build-400",
        limit: 100,
      }),
    ).rejects.toThrow("Invalid sync token");
  });
});
