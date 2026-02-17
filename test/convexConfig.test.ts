import { afterEach, describe, expect, test } from "bun:test";

import {
  getConvexClient,
  getSyncTokenOptional,
} from "../app/api/_lib/convex";

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
  test("returns null client when CONVEX_URL is not set", () => {
    delete process.env.CONVEX_URL;

    const client = getConvexClient();

    expect(client).toBeNull();
  });

  test("returns sync token when present", () => {
    process.env.DAMODARAN_SYNC_TOKEN = "token-123";

    expect(getSyncTokenOptional()).toBe("token-123");
  });

  test("returns null sync token when missing", () => {
    delete process.env.DAMODARAN_SYNC_TOKEN;

    expect(getSyncTokenOptional()).toBeNull();
  });
});
