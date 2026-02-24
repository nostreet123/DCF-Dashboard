/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from "bun:test";

import { hasValidSyncToken, requireSyncToken } from "../convex/syncAuth";

const originalToken = process.env.DAMODARAN_SYNC_TOKEN;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.DAMODARAN_SYNC_TOKEN;
    return;
  }
  process.env.DAMODARAN_SYNC_TOKEN = originalToken;
});

describe("syncAuth", () => {
  test("hasValidSyncToken returns false when env is missing", () => {
    delete process.env.DAMODARAN_SYNC_TOKEN;
    expect(hasValidSyncToken("token")).toBe(false);
  });

  test("hasValidSyncToken matches exact token", () => {
    process.env.DAMODARAN_SYNC_TOKEN = "expected-token";
    expect(hasValidSyncToken("expected-token")).toBe(true);
    expect(hasValidSyncToken("other-token")).toBe(false);
    expect(hasValidSyncToken(undefined)).toBe(false);
  });

  test("requireSyncToken throws UNAUTHORIZED for all invalid states", () => {
    delete process.env.DAMODARAN_SYNC_TOKEN;
    expect(() => requireSyncToken("token")).toThrow("Invalid sync token");

    process.env.DAMODARAN_SYNC_TOKEN = "expected-token";
    expect(() => requireSyncToken(undefined)).toThrow("Invalid sync token");
    expect(() => requireSyncToken("wrong-token")).toThrow("Invalid sync token");
    expect(() => requireSyncToken("expected-token")).not.toThrow();
  });
});
