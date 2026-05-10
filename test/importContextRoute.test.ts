/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { GET } from "../app/api/company/import/context/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;
const originalQuery = ConvexHttpClient.prototype.query;
let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  resetRateLimitStateForTests();
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetRateLimitStateForTests();
  ConvexHttpClient.prototype.query = originalQuery;
  restoreSecurityMock?.();
  restoreSecurityMock = null;
  if (originalConvexUrl === undefined) delete process.env.CONVEX_URL;
  else process.env.CONVEX_URL = originalConvexUrl;
  if (originalSyncToken === undefined) delete process.env.DAMODARAN_SYNC_TOKEN;
  else process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  process.env.NODE_ENV = originalNodeEnv;
});

describe("company import context route", () => {
  test("returns approved imported facts and matching artifact metadata from Convex", async () => {
    const importedFacts = {
      listingId: "sec:0000320193:AAPL",
      symbol: "AAPL",
      artifactIds: ["artifact-1"],
      facts: { statements: [{ periodEnd: "2025-09-30", revenue: 395000 }] },
      provenance: { sourceSystem: "convex-import" },
    };
    const artifacts = [
      { artifactId: "artifact-1", status: "approved", originalFilename: "aapl.xlsx" },
      { artifactId: "artifact-2", status: "approved", originalFilename: "ignored.xlsx" },
    ];
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      calls.push({ name: String(name), args: args as Record<string, unknown> });
      if (String(name) === "imports:getImportedFacts") {
        return importedFacts;
      }
      if (String(name) === "imports:listArtifactsForListing") {
        return artifacts;
      }
      return null;
    };

    const response = await GET(
      new Request(
        "http://localhost/api/company/import/context?listingId=sec%3A0000320193%3AAAPL&symbol=AAPL",
        { headers: { "x-vercel-forwarded-for": "203.0.113.170" } },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        name: "imports:getImportedFacts",
        args: { listingId: "sec:0000320193:AAPL" },
      },
      {
        name: "imports:listArtifactsForListing",
        args: { listingId: "sec:0000320193:AAPL", status: "approved", limit: 20 },
      },
    ]);
    expect(payload.importedFacts).toEqual(importedFacts);
    expect(payload.artifacts).toEqual([artifacts[0]]);
  });

  test("returns empty context when Convex is not configured", async () => {
    delete process.env.CONVEX_URL;
    delete process.env.DAMODARAN_SYNC_TOKEN;
    process.env.NODE_ENV = "development";

    const response = await GET(
      new Request("http://localhost/api/company/import/context?symbol=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.171" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ importedFacts: null, artifacts: [] });
  });
});
