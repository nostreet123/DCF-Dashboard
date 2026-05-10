/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules: Record<string, () => Promise<any>> = {};
const glob = new Bun.Glob("**/*.ts");
const convexDir = `${import.meta.dir}/../convex`;
for (const entry of glob.scanSync({ cwd: convexDir, absolute: false })) {
  const key = `../convex/${entry}`;
  const fullPath = `${convexDir}/${entry}`;
  modules[key] = () => import(fullPath);
}

const TEST_SYNC_TOKEN = "test-sync-token-for-security-rate-limit";

beforeEach(() => {
  process.env.DAMODARAN_SYNC_TOKEN = TEST_SYNC_TOKEN;
});

describe("securityRateLimit", () => {
  test("accepts the 24 hour window used by the AI daily cap", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(api.securityRateLimit.hitBucket, {
      syncToken: TEST_SYNC_TOKEN,
      bucketKey: "api:ai:scenario-analysis:daily:global",
      limit: 25,
      windowMs: 24 * 60 * 60 * 1000,
      nowMs: 1_000,
    });

    expect(result.allowed).toBe(true);
  });

  test("rejects windows above the daily cap horizon", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.securityRateLimit.hitBucket, {
        syncToken: TEST_SYNC_TOKEN,
        bucketKey: "too-long",
        limit: 1,
        windowMs: 24 * 60 * 60 * 1000 + 1,
        nowMs: 1_000,
      }),
    ).rejects.toThrow("windowMs must be an integer between 1 and 86400000");
  });
});
