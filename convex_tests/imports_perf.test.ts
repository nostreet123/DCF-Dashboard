/// <reference types="bun-types" />
import { test, expect, beforeEach, afterEach } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const TEST_SYNC_TOKEN = "test-sync-token";
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;

const modules: Record<string, () => Promise<any>> = {};
const glob = new Bun.Glob("**/*.ts");
const convexDir = `${import.meta.dir}/../convex`;
for (const entry of glob.scanSync({ cwd: convexDir, absolute: false })) {
  const key = `../convex/${entry}`;
  const fullPath = `${convexDir}/${entry}`;
  modules[key] = () => import(fullPath);
}

beforeEach(() => {
  process.env.DAMODARAN_SYNC_TOKEN = TEST_SYNC_TOKEN;
});

afterEach(() => {
  if (originalSyncToken === undefined) {
    delete process.env.DAMODARAN_SYNC_TOKEN;
  } else {
    process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  }
});

test("performance regression test for approveImportedFacts", async () => {
  const t = convexTest(schema, modules);

  const artifactIds = Array.from({ length: 50 }, (_, i) => `artifact-${i}`);

  await t.run(async (ctx) => {
    for (const id of artifactIds) {
      await ctx.db.insert("importArtifacts", {
        artifactId: id,
        listingId: "XLON:VOD",
        kind: "incomeStatement",
        status: "pending",
        originalFilename: `${id}.pdf`,
        parserName: "test",
        fileFormat: "pdf",
        byteSize: 1000,
        createdAt: Date.now(),
      });
    }
  });

  await t.mutation(api.imports.approveImportedFacts, {
    syncToken: TEST_SYNC_TOKEN,
    listingId: "XLON:VOD",
    symbol: "VOD",
    name: "Vodafone",
    coverageState: "valuation_ready",
    facts: {},
    review: {},
    provenance: {},
    sourceLinks: [],
    artifactIds: artifactIds,
  });

  const artifacts = await t.query(api.imports.listArtifactsForListing, {
    syncToken: TEST_SYNC_TOKEN,
    listingId: "XLON:VOD",
    limit: 50,
  });
  expect(artifacts.length).toBe(50);
  expect(artifacts.every((a) => a.status === "approved")).toBe(true);
});
