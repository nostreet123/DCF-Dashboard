import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getSyncToken, mutateConvex, queryConvex } from "../app/api/_lib/convex.ts";

const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;

afterEach(() => {
  if (originalConvexUrl === undefined) {
    delete process.env.CONVEX_URL;
  } else {
    process.env.CONVEX_URL = originalConvexUrl;
  }
  if (originalSyncToken === undefined) {
    delete process.env.DAMODARAN_SYNC_TOKEN;
  } else {
    process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  }
});

describe("convex config", () => {
  it("throws config errors at call time when CONVEX_URL is missing", async () => {
    delete process.env.CONVEX_URL;

    await assert.rejects(
      () => queryConvex("reference:getLatestSnapshot", {}),
      /CONVEX_URL is required/,
    );
    await assert.rejects(
      () => mutateConvex("debugEvents:append", {}),
      /CONVEX_URL is required/,
    );
  });

  it("throws when DAMODARAN_SYNC_TOKEN is missing", () => {
    delete process.env.DAMODARAN_SYNC_TOKEN;
    assert.throws(() => getSyncToken(), /DAMODARAN_SYNC_TOKEN is required/);
  });
});
