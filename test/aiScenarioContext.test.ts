/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import {
  browserPrivateConvexContextEnabled,
  extractConvexLookup,
  loadConvexAiContext,
} from "../lib/ai/scenarioAnalysis/convexContext";
import { installAiScenarioTestEnv, sha256Hex } from "./helpers/aiScenario";

let restoreEnv: (() => void) | null = null;

beforeEach(() => {
  const setup = installAiScenarioTestEnv();
  restoreEnv = setup.restore;
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("AI scenario Convex context", () => {
  test("extractConvexLookup reads company id and symbol", () => {
    expect(
      extractConvexLookup({
        company: { id: "sec:0000320193:AAPL", symbol: "AAPL" },
      }),
    ).toEqual({
      listingId: "sec:0000320193:AAPL",
      symbol: "AAPL",
    });
  });

  test("browserPrivateConvexContextEnabled reflects env flag outside production", () => {
    delete process.env.VALUATION_HISTORY_BROWSER_READS;
    delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    expect(browserPrivateConvexContextEnabled()).toBe(false);
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    expect(browserPrivateConvexContextEnabled()).toBe(true);
  });

  test("browserPrivateConvexContextEnabled stays off in production even when flag is set", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    delete process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES;
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    expect(browserPrivateConvexContextEnabled()).toBe(false);
  });

  test("loadConvexAiContext returns disabled reason when browser reads are off", async () => {
    delete process.env.VALUATION_HISTORY_BROWSER_READS;
    const context = await loadConvexAiContext(
      { company: { id: "sec:0000320193:AAPL", symbol: "AAPL" } },
      {
        includeImportContext: false,
        includePrivateData: false,
        includeSavedRunTrace: false,
      },
    );
    expect(context.available).toBe(false);
    expect(context.reason).toBe("BROWSER_READS_DISABLED");
    expect(context.lookup.symbol).toBe("AAPL");
  });

  test("loadConvexAiContext loads company, statements, imports, and public runs", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256 = sha256Hex("unused");
    const calledQueries: string[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      calledQueries.push(String(name));
      if (String(name) === "companies:get") {
        expect(args as unknown).toEqual({ symbol: "CTX" });
        return { symbol: "CTX", name: "Context Co.", source: "edgar" };
      }
      if (String(name) === "companyStatements:listBySymbol") {
        return {
          statements: [{ periodEnd: "2025-09-30", revenue: 100, operatingMargin: 0.2 }],
          nextCursor: null,
        };
      }
      if (String(name) === "imports:getImportedFacts") {
        return {
          listingId: "sec:0000000001:CTX",
          artifactIds: ["artifact-1"],
          facts: { revenue: 100 },
        };
      }
      if (String(name) === "imports:listArtifactsForListing") {
        return [
          {
            artifactId: "artifact-1",
            status: "approved",
            storageId: "secret-storage-id",
            parseResult: { rawRows: [["private"]] },
            url: "convex-storage:secret-storage-id",
          },
        ];
      }
      if (String(name) === "valuations:listByTicker") {
        return [
          {
            _id: "run-1",
            createdAt: 1700000000000,
            status: "success",
            symbol: "CTX",
            resultSummary: { base: { fairValuePerShare: 50 } },
            normalizedInputs: { revenueGrowth: 0.1 },
          },
        ];
      }
      if (String(name) === "seed:getReference") {
        return { datasets: [{ key: "wacc" }], regions: [], datasetMappings: [] };
      }
      if (String(name) === "valuations:get") {
        throw new Error("Public context must not fetch saved-run traces");
      }
      return null;
    };

    const context = await loadConvexAiContext(
      { company: { id: "sec:0000000001:CTX", symbol: "CTX" } },
      {
        includeImportContext: true,
        includePrivateData: true,
        includeSavedRunTrace: false,
      },
    );

    expect(context.available).toBe(true);
    expect(calledQueries).toContain("companies:get");
    expect(calledQueries).toContain("imports:getImportedFacts");
    expect(calledQueries).not.toContain("valuations:get");
    expect(context.companyCache).toEqual({
      symbol: "CTX",
      name: "Context Co.",
      source: "edgar",
    });
    expect(context.companyStatementHistory).toEqual([
      { periodEnd: "2025-09-30", revenue: 100, operatingMargin: 0.2 },
    ]);
    expect(JSON.stringify(context.importedFacts)).toContain("\"revenue\":100");
    expect(JSON.stringify(context.importArtifacts)).not.toContain("secret-storage-id");
    expect(JSON.stringify(context.importArtifacts)).not.toContain("parseResult");
    expect(JSON.stringify(context.recentValuationRuns)).toContain("\"fairValuePerShare\":50");
    expect(JSON.stringify(context.recentValuationRuns)).not.toContain("normalizedInputs");
    expect(context.latestValuationRunDetail).toBeNull();
  });

  test("loadConvexAiContext includes saved-run trace detail for admin requests", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    ConvexHttpClient.prototype.query = async (name, args) => {
      if (String(name) === "companies:get") {
        return { symbol: "ADM", name: "Admin Co." };
      }
      if (String(name) === "companyStatements:listBySymbol") {
        return { statements: [], nextCursor: null };
      }
      if (String(name) === "valuations:listByTicker") {
        return [{ _id: "run-admin", symbol: "ADM", status: "success" }];
      }
      if (String(name) === "valuations:get") {
        expect(args as unknown).toEqual({
          syncToken: "sync-token",
          runId: "run-admin",
          includeTrace: true,
        });
        return {
          run: {
            _id: "run-admin",
            symbol: "ADM",
            trace: {
              base: { valuation: { fairValuePerShare: 42 } },
              monteCarlo: { summary: { p90: 54 }, histogram: { density: [1] } },
            },
          },
        };
      }
      if (String(name) === "seed:getReference") {
        return { datasets: [], regions: [], datasetMappings: [] };
      }
      return null;
    };

    const context = await loadConvexAiContext(
      { company: { symbol: "ADM" } },
      {
        includeImportContext: false,
        includePrivateData: true,
        includeSavedRunTrace: true,
      },
    );

    expect(context.available).toBe(true);
    expect(JSON.stringify(context.latestValuationRunDetail)).toContain("\"fairValuePerShare\":42");
    expect(JSON.stringify(context.latestValuationRunDetail)).toContain("\"p90\":54");
    expect(JSON.stringify(context.latestValuationRunDetail)).not.toContain("histogram");
  });
});
