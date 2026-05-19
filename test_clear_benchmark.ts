import { convexTest } from "convex-test";
import { expect, test } from "bun:test";
import { api, internal } from "./convex/_generated/api";
import schema from "./convex/schema";

test("benchmark clearDuplicateGroupsForScanInternal", async () => {
  const t = convexTest(schema);

  // setup dummy data
  const scanId = await t.runMutation(api.maintenance.duplicateScan.startDuplicateScan, {
    pageLimit: 100,
  });

  // insert fake duplicate groups
  const groups = Array.from({ length: 2000 }).map((_, i) => ({
    datasetKey: "test",
    regionCode: "US",
    asOfDate: "2021-01-01",
    count: 2,
    ids: [],
  }));

  await t.runMutation(internal.maintenance.duplicateScan.insertSnapshotGroupsInternal, {
    scanId,
    runId: "dummy",
    groups,
  });

  // measure time
  const start = performance.now();
  await t.runMutation(internal.maintenance.duplicateScan.clearDuplicateGroupsForScanInternal, {
    scanId,
  });
  const end = performance.now();

  console.log(`Time taken: ${end - start}ms`);
});
