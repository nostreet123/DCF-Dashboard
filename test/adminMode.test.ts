/// <reference types="bun-types" />
import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";

import {
  isAdminModeConfigured,
  isAdminModeRequest,
} from "../app/api/_lib/adminMode";

const originalAdminTokenHash = process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
const validToken = "test-admin-token-123456";
const validHash = createHash("sha256").update(validToken).digest("hex");

const requestWithToken = (token?: string) =>
  new Request("http://localhost/api/ai/scenario-analysis", {
    headers: token === undefined ? {} : { "x-dcf-admin-token": token },
  });

afterEach(() => {
  if (originalAdminTokenHash === undefined) {
    delete process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
  } else {
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = originalAdminTokenHash;
  }
});

describe("admin mode token verifier", () => {
  test("accepts only the raw admin token matching the configured digest", () => {
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = validHash;

    expect(isAdminModeConfigured()).toBe(true);
    expect(isAdminModeRequest(requestWithToken(validToken))).toBe(true);
    expect(isAdminModeRequest(requestWithToken("wrong-admin-token-123"))).toBe(false);
  });

  test("does not accept the configured digest, digest-of-digest, or comma-combined headers", () => {
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = validHash;
    const digestOfDigest = createHash("sha256").update(validHash).digest("hex");

    expect(isAdminModeRequest(requestWithToken(validHash))).toBe(false);
    expect(isAdminModeRequest(requestWithToken(digestOfDigest))).toBe(false);
    expect(isAdminModeRequest(requestWithToken(`${validToken}, attacker-token`))).toBe(false);
    expect(isAdminModeRequest(requestWithToken(`attacker-token, ${validToken}`))).toBe(false);
  });

  test("rejects missing, empty, short, appended, unicode, and oversized tokens", () => {
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = validHash;

    expect(isAdminModeRequest(requestWithToken())).toBe(false);
    expect(isAdminModeRequest(requestWithToken(""))).toBe(false);
    expect(isAdminModeRequest(requestWithToken("short-token"))).toBe(false);
    expect(isAdminModeRequest(requestWithToken(`${validToken} extra`))).toBe(false);
    expect(isAdminModeRequest(requestWithToken(`${validToken}\tpadding`))).toBe(false);
    expect(isAdminModeRequest(requestWithToken(`${validToken}ñ`))).toBe(false);
    expect(isAdminModeRequest(requestWithToken("a".repeat(513)))).toBe(false);
  });

  test("treats uppercase hex config as valid but rejects malformed config", () => {
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = validHash.toUpperCase();
    expect(isAdminModeConfigured()).toBe(true);
    expect(isAdminModeRequest(requestWithToken(validToken))).toBe(true);

    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = "g".repeat(64);
    expect(isAdminModeConfigured()).toBe(false);
    expect(isAdminModeRequest(requestWithToken(validToken))).toBe(false);

    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = "a".repeat(63);
    expect(isAdminModeConfigured()).toBe(false);
    expect(isAdminModeRequest(requestWithToken(validToken))).toBe(false);

    delete process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
    expect(isAdminModeConfigured()).toBe(false);
    expect(isAdminModeRequest(requestWithToken(validToken))).toBe(false);
  });
});
