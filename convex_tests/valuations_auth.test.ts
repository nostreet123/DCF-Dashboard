/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from "bun:test";

import { requireValuationReadAccess } from "../convex/valuations";

const originalToken = process.env.DAMODARAN_SYNC_TOKEN;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.DAMODARAN_SYNC_TOKEN;
    return;
  }
  process.env.DAMODARAN_SYNC_TOKEN = originalToken;
});

describe("valuation read access", () => {
  test("rejects reads when sync token is missing", () => {
    delete process.env.DAMODARAN_SYNC_TOKEN;
    expect(() => requireValuationReadAccess("token")).toThrow("Invalid sync token");
  });

  test("rejects reads with invalid token", () => {
    process.env.DAMODARAN_SYNC_TOKEN = "expected-token";
    expect(() => requireValuationReadAccess(undefined)).toThrow("Invalid sync token");
    expect(() => requireValuationReadAccess("wrong-token")).toThrow("Invalid sync token");
  });

  test("allows reads with valid token", () => {
    process.env.DAMODARAN_SYNC_TOKEN = "expected-token";
    expect(() => requireValuationReadAccess("expected-token")).not.toThrow();
  });
});
