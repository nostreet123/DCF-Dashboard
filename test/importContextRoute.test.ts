/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { ConvexHttpClient } from "convex/browser";

import { GET } from "../app/api/company/import/context/route";
import { GET as GET_BROWSER } from "../app/api/company/import/context/browser/route";
import { createInternalPersistenceHeaders } from "../app/api/_lib/internalAuth";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;
const originalQuery = ConvexHttpClient.prototype.query;
const originalBrowserReads = process.env.VALUATION_HISTORY_BROWSER_READS;
const originalContextTokenHash = process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256;
let restoreSecurityMock: (() => void) | null = null;

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

beforeEach(() => {
  resetRateLimitStateForTests();
  process.env.INTERNAL_PERSISTENCE_KEY = "secret";
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
  if (originalInternalPersistenceKey === undefined) delete process.env.INTERNAL_PERSISTENCE_KEY;
  else process.env.INTERNAL_PERSISTENCE_KEY = originalInternalPersistenceKey;
  if (originalConvexUrl === undefined) delete process.env.CONVEX_URL;
  else process.env.CONVEX_URL = originalConvexUrl;
  if (originalSyncToken === undefined) delete process.env.DAMODARAN_SYNC_TOKEN;
  else process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  if (originalBrowserReads === undefined) delete process.env.VALUATION_HISTORY_BROWSER_READS;
  else process.env.VALUATION_HISTORY_BROWSER_READS = originalBrowserReads;
  if (originalContextTokenHash === undefined) delete process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256;
  else process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256 = originalContextTokenHash;
  process.env.NODE_ENV = originalNodeEnv;
});

describe("company import context route", () => {
  test("rejects unauthenticated import context reads", async () => {
    const response = await GET(
      new Request("http://localhost/api/company/import/context?symbol=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.169" },
      }),
    );

    expect(response.status).toBe(401);
  });

  test("browser import context wrapper stays disabled unless browser reads are enabled", async () => {
    delete process.env.VALUATION_HISTORY_BROWSER_READS;

    const response = await GET_BROWSER(
      new Request("http://localhost/api/company/import/context/browser?symbol=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.172" },
      }),
    );

    expect(response.status).toBe(404);
  });

  test("returns approved imported facts and matching artifact metadata from Convex", async () => {
    const importedFacts = {
      _id: "internal-facts-id",
      _creationTime: 1700000000000,
      listingId: "sec:0000320193:AAPL",
      symbol: "AAPL",
      artifactIds: ["artifact-1"],
      facts: { statements: [{ periodEnd: "2025-09-30", revenue: 395000 }] },
      provenance: {
        sourceSystem: "convex-import",
        sourceLinks: [{ title: "Uploaded workbook", url: "convex-storage:secret-storage-id" }],
      },
    };
    const artifacts = [
      {
        _id: "internal-artifact-id",
        artifactId: "artifact-1",
        status: "approved",
        originalFilename: "aapl.xlsx",
        storageId: "secret-storage-id",
        parseResult: { rawRows: [["private"]] },
      },
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

    const url = "http://localhost/api/company/import/context?listingId=sec%3A0000320193%3AAAPL&symbol=AAPL";
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      nonce: "import-context-auth-test",
      timestampMs: Date.now(),
    });

    const response = await GET(
      new Request(url, {
        headers: { ...authHeaders, "x-vercel-forwarded-for": "203.0.113.170" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        name: "imports:getImportedFacts",
        args: { syncToken: "sync-token", listingId: "sec:0000320193:AAPL" },
      },
      {
        name: "imports:listArtifactsForListing",
        args: {
          syncToken: "sync-token",
          listingId: "sec:0000320193:AAPL",
          status: "approved",
          limit: 20,
        },
      },
    ]);
    expect(payload.importedFacts).toEqual({
      listingId: "sec:0000320193:AAPL",
      symbol: "AAPL",
      artifactIds: ["artifact-1"],
      facts: { statements: [{ periodEnd: "2025-09-30", revenue: 395000 }] },
      provenance: {
        sourceSystem: "convex-import",
        sourceLinks: [{ title: "Uploaded workbook", url: "approved-import-artifact" }],
      },
    });
    expect(payload.artifacts).toEqual([
      { artifactId: "artifact-1", status: "approved", originalFilename: "aapl.xlsx" },
    ]);
  });

  test("browser import context wrapper signs internal context reads", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256 = sha256Hex("correct-token");
    const importedFacts = {
      _id: "internal-facts-id",
      listingId: "sec:0000320193:AAPL",
      symbol: "AAPL",
      artifactIds: ["artifact-1"],
      facts: { statements: [{ periodEnd: "2025-09-30", revenue: 395000 }] },
    };
    const artifacts = [
      {
        artifactId: "artifact-1",
        status: "approved",
        originalFilename: "aapl.xlsx",
        storageId: "secret-storage-id",
        parseResult: { rawRows: [["private"]] },
      },
      { artifactId: "artifact-2", status: "approved", originalFilename: "ignored.xlsx" },
    ];
    ConvexHttpClient.prototype.query = async (name) => {
      if (String(name) === "imports:getImportedFacts") {
        return importedFacts;
      }
      if (String(name) === "imports:listArtifactsForListing") {
        return artifacts;
      }
      return null;
    };

    const response = await GET_BROWSER(
      new Request(
        "http://localhost/api/company/import/context/browser?listingId=sec%3A0000320193%3AAAPL&symbol=AAPL",
        {
          headers: {
            "x-vercel-forwarded-for": "203.0.113.173",
            "x-import-context-token": "correct-token",
          },
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.importedFacts).toEqual({
      listingId: "sec:0000320193:AAPL",
      symbol: "AAPL",
      artifactIds: ["artifact-1"],
      facts: { statements: [{ periodEnd: "2025-09-30", revenue: 395000 }] },
    });
    expect(payload.artifacts).toEqual([
      { artifactId: "artifact-1", status: "approved", originalFilename: "aapl.xlsx" },
    ]);
  });

  test("browser import context wrapper requires a context token before signing", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256 = sha256Hex("correct-token");

    const response = await GET_BROWSER(
      new Request("http://localhost/api/company/import/context/browser?symbol=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.174" },
      }),
    );

    expect(response.status).toBe(401);
  });

  test("rejects import context reads when internal auth backing store is not configured", async () => {
    delete process.env.CONVEX_URL;
    delete process.env.DAMODARAN_SYNC_TOKEN;
    process.env.NODE_ENV = "development";

    const url = "http://localhost/api/company/import/context?symbol=AAPL";
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      nonce: "import-context-empty-test",
      timestampMs: Date.now(),
    });

    const response = await GET(
      new Request(url, {
        headers: { ...authHeaders, "x-vercel-forwarded-for": "203.0.113.171" },
      }),
    );

    expect(response.status).toBe(401);
  });
});
