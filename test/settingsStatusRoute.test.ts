import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { GET } from "../app/api/settings/status/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import {
  VALID_ADMIN_TOKEN,
  VALID_ADMIN_TOKEN_HASH,
} from "./helpers/adminModeTestToken";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalSecUserAgent = process.env.SEC_USER_AGENT;
const originalHfKey = process.env.HUGGING_FACE_API_KEY;
const originalHfModel = process.env.HUGGING_FACE_MODEL;
const originalAdminTokenHash = process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalRateLimitAllowLocalhost = process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST;
let restoreSecurityMock: (() => void) | null = null;

const requestWithAdminToken = (token?: string, forwardedFor = "203.0.113.100") =>
  new Request("http://localhost/api/settings/status", {
    headers: {
      "x-vercel-forwarded-for": forwardedFor,
      ...(token === undefined ? {} : { "x-dcf-admin-token": token }),
    },
  });

beforeEach(() => {
  resetRateLimitStateForTests();
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetRateLimitStateForTests();
  restoreSecurityMock?.();
  restoreSecurityMock = null;
  if (originalSecUserAgent === undefined) delete process.env.SEC_USER_AGENT;
  else process.env.SEC_USER_AGENT = originalSecUserAgent;
  if (originalHfKey === undefined) delete process.env.HUGGING_FACE_API_KEY;
  else process.env.HUGGING_FACE_API_KEY = originalHfKey;
  if (originalHfModel === undefined) delete process.env.HUGGING_FACE_MODEL;
  else process.env.HUGGING_FACE_MODEL = originalHfModel;
  if (originalAdminTokenHash === undefined) delete process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
  else process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = originalAdminTokenHash;
  if (originalConvexUrl === undefined) delete process.env.CONVEX_URL;
  else process.env.CONVEX_URL = originalConvexUrl;
  if (originalSyncToken === undefined) delete process.env.DAMODARAN_SYNC_TOKEN;
  else process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  if (originalRateLimitAllowLocalhost === undefined) delete process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST;
  else process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST = originalRateLimitAllowLocalhost;
});

describe("settings status route", () => {
  test("rejects public requests without an admin token", async () => {
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = VALID_ADMIN_TOKEN_HASH;

    const response = await GET(requestWithAdminToken());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      code: "FORBIDDEN",
      message: "Admin access required.",
    });
    expect(JSON.stringify(payload)).not.toContain("sync-token");
  });

  test("rejects requests with an invalid admin token", async () => {
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = VALID_ADMIN_TOKEN_HASH;

    const response = await GET(requestWithAdminToken("wrong-admin-token-123"));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      code: "FORBIDDEN",
      message: "Admin access required.",
    });
  });

  test("reports configured server integrations for valid admin requests without exposing secrets", async () => {
    process.env.SEC_USER_AGENT = "DCF Dashboard test@example.com";
    process.env.HUGGING_FACE_API_KEY = "hf_secret";
    process.env.HUGGING_FACE_MODEL = "test/model";
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = VALID_ADMIN_TOKEN_HASH;
    process.env.CONVEX_URL = "https://example.convex.cloud";
    process.env.DAMODARAN_SYNC_TOKEN = "sync-token";

    const response = await GET(requestWithAdminToken(VALID_ADMIN_TOKEN));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.secUserAgent.configured).toBe(true);
    expect(payload.ai).toEqual({
      configured: true,
      model: "test/model",
      adminModeAvailable: true,
    });
    expect(payload.convex.importsReady).toBe(true);
    expect(payload.convex.historyReady).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("hf_secret");
    expect(JSON.stringify(payload)).not.toContain(VALID_ADMIN_TOKEN_HASH);
    expect(JSON.stringify(payload)).not.toContain("sync-token");
  });

  test("does not report admin mode available for malformed admin hash config", async () => {
    process.env.HUGGING_FACE_API_KEY = "hf_secret";
    process.env.HUGGING_FACE_MODEL = "test/model";
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = "not-a-valid-sha256";
    process.env.CONVEX_URL = "https://example.convex.cloud";
    process.env.DAMODARAN_SYNC_TOKEN = "sync-token";

    const response = await GET(requestWithAdminToken(VALID_ADMIN_TOKEN));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      code: "FORBIDDEN",
      message: "Admin access required.",
    });
    expect(JSON.stringify(payload)).not.toContain("not-a-valid-sha256");
  });

  test("does not report valuation history ready without the Convex sync token", async () => {
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = VALID_ADMIN_TOKEN_HASH;
    process.env.CONVEX_URL = "https://example.convex.cloud";
    delete process.env.DAMODARAN_SYNC_TOKEN;
    process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST = "1";

    const response = await GET(
      new Request("http://localhost/api/settings/status", {
        headers: { "x-dcf-admin-token": VALID_ADMIN_TOKEN },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.convex.configured).toBe(true);
    expect(payload.convex.syncTokenConfigured).toBe(false);
    expect(payload.convex.historyReady).toBe(false);
    expect(payload.convex.importsReady).toBe(false);
  });
});
