import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { POST } from "../app/api/company/import/parse/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalAllowUnsigned = process.env.DCF_ENGINE_ALLOW_UNSIGNED;
const originalFetch = globalThis.fetch;

let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  process.env.DCF_ENGINE_URL = "http://engine.example";
  process.env.DCF_ENGINE_ALLOW_UNSIGNED = "1";
});

afterEach(() => {
  resetRateLimitStateForTests();
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;
  globalThis.fetch = originalFetch;
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
  if (originalDcfEngineUrl === undefined) {
    delete process.env.DCF_ENGINE_URL;
  } else {
    process.env.DCF_ENGINE_URL = originalDcfEngineUrl;
  }
  if (originalAllowUnsigned === undefined) {
    delete process.env.DCF_ENGINE_ALLOW_UNSIGNED;
  } else {
    process.env.DCF_ENGINE_ALLOW_UNSIGNED = originalAllowUnsigned;
  }
});

describe("company import parse route", () => {
  test("does not persist accepted artifacts from unsigned browser uploads", async () => {
    const securityMock = installSecurityMutationsMock();
    restoreSecurityMock = securityMock.restore;
    globalThis.fetch = async (url) => {
      expect(String(url)).toBe("http://engine.example/company/import/parse");
      return new Response(
        JSON.stringify({
          artifacts: [
            {
              id: "artifact-accepted",
              kind: "incomeStatement",
              originalFilename: "income.csv",
              parserName: "CSV",
              fileFormat: "csv",
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const formData = new FormData();
    formData.append("files", new File(["Revenue,10"], "income.csv", { type: "text/csv" }));

    const response = await POST(
      new Request("http://localhost/api/company/import/parse?listingId=XTSE:SHOP", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.53" },
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(securityMock.calls).not.toContain("imports:generateUploadUrl");
    expect(securityMock.calls).not.toContain("imports:saveParsedArtifact");
  });

  test("does not upload artifacts before parser acceptance", async () => {
    const securityMock = installSecurityMutationsMock();
    restoreSecurityMock = securityMock.restore;
    globalThis.fetch = async (url) => {
      expect(String(url)).toBe("http://engine.example/company/import/parse");
      return new Response(JSON.stringify({ detail: "unsupported file" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    };
    const formData = new FormData();
    formData.append("files", new File(["bad"], "bad.unsupported"));

    const response = await POST(
      new Request("http://localhost/api/company/import/parse?listingId=XTSE:SHOP", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.52" },
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    expect(securityMock.calls).not.toContain("imports:generateUploadUrl");
  });
});
