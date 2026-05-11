/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";

import { POST } from "../app/api/ai/scenario-analysis/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalFetch = globalThis.fetch;
const originalQuery = ConvexHttpClient.prototype.query;
const originalHfKey = process.env.HUGGING_FACE_API_KEY;
const originalHfModel = process.env.HUGGING_FACE_MODEL;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalAdminTokenHash = process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
const originalDailyLimit = process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY;
const originalMinuteLimit = process.env.API_RATE_LIMIT_AI_SCENARIO_PER_MINUTE;
const originalMaxInputBytes = process.env.HUGGING_FACE_MAX_INPUT_BYTES;
const originalMaxOutputTokens = process.env.HUGGING_FACE_MAX_OUTPUT_TOKENS;
const originalReasoningEffort = process.env.HUGGING_FACE_REASONING_EFFORT;
const originalResponseFormat = process.env.HUGGING_FACE_RESPONSE_FORMAT;
const originalTemperature = process.env.HUGGING_FACE_TEMPERATURE;
const originalTopP = process.env.HUGGING_FACE_TOP_P;
const originalBrowserReads = process.env.VALUATION_HISTORY_BROWSER_READS;
const originalImportContextTokenHash = process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256;
const validAdminToken = "test-admin-token-123456";
const noopPreconnect: typeof fetch.preconnect = () => {};
let restoreSecurityMock: (() => void) | null = null;

function createMockFetch(
  impl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(impl, { preconnect: noopPreconnect });
}

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

beforeEach(() => {
  resetRateLimitStateForTests();
  process.env.HUGGING_FACE_API_KEY = "hf_secret";
  process.env.HUGGING_FACE_MODEL = "test/model";
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 =
    "3163e9ca0a8a3732674d6ea50aa8b48c77818fa6f38da5db28f5316c17ad8bb1";
  process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY = "25";
  process.env.HUGGING_FACE_MAX_INPUT_BYTES = "32000";
  process.env.HUGGING_FACE_MAX_OUTPUT_TOKENS = "8192";
  process.env.HUGGING_FACE_REASONING_EFFORT = "xhigh";
  process.env.HUGGING_FACE_RESPONSE_FORMAT = "json_object";
  process.env.HUGGING_FACE_TEMPERATURE = "1";
  process.env.HUGGING_FACE_TOP_P = "1";
  delete process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256;
  ConvexHttpClient.prototype.query = async (name) => {
    if (
      String(name) === "imports:listBySymbol" ||
      String(name) === "imports:listArtifactsForListing" ||
      String(name) === "valuations:listByTicker"
    ) {
      return [];
    }
    if (String(name) === "companyStatements:listBySymbol") {
      return { statements: [], nextCursor: null };
    }
    return null;
  };
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetRateLimitStateForTests();
  restoreSecurityMock?.();
  restoreSecurityMock = null;
  globalThis.fetch = originalFetch;
  ConvexHttpClient.prototype.query = originalQuery;
  if (originalHfKey === undefined) delete process.env.HUGGING_FACE_API_KEY;
  else process.env.HUGGING_FACE_API_KEY = originalHfKey;
  if (originalHfModel === undefined) delete process.env.HUGGING_FACE_MODEL;
  else process.env.HUGGING_FACE_MODEL = originalHfModel;
  if (originalConvexUrl === undefined) delete process.env.CONVEX_URL;
  else process.env.CONVEX_URL = originalConvexUrl;
  if (originalSyncToken === undefined) delete process.env.DAMODARAN_SYNC_TOKEN;
  else process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  if (originalAdminTokenHash === undefined) delete process.env.DCF_DEMO_ADMIN_TOKEN_SHA256;
  else process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = originalAdminTokenHash;
  if (originalDailyLimit === undefined) delete process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY;
  else process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY = originalDailyLimit;
  if (originalMinuteLimit === undefined) delete process.env.API_RATE_LIMIT_AI_SCENARIO_PER_MINUTE;
  else process.env.API_RATE_LIMIT_AI_SCENARIO_PER_MINUTE = originalMinuteLimit;
  if (originalMaxInputBytes === undefined) delete process.env.HUGGING_FACE_MAX_INPUT_BYTES;
  else process.env.HUGGING_FACE_MAX_INPUT_BYTES = originalMaxInputBytes;
  if (originalMaxOutputTokens === undefined) delete process.env.HUGGING_FACE_MAX_OUTPUT_TOKENS;
  else process.env.HUGGING_FACE_MAX_OUTPUT_TOKENS = originalMaxOutputTokens;
  if (originalReasoningEffort === undefined) delete process.env.HUGGING_FACE_REASONING_EFFORT;
  else process.env.HUGGING_FACE_REASONING_EFFORT = originalReasoningEffort;
  if (originalResponseFormat === undefined) delete process.env.HUGGING_FACE_RESPONSE_FORMAT;
  else process.env.HUGGING_FACE_RESPONSE_FORMAT = originalResponseFormat;
  if (originalTemperature === undefined) delete process.env.HUGGING_FACE_TEMPERATURE;
  else process.env.HUGGING_FACE_TEMPERATURE = originalTemperature;
  if (originalTopP === undefined) delete process.env.HUGGING_FACE_TOP_P;
  else process.env.HUGGING_FACE_TOP_P = originalTopP;
  if (originalBrowserReads === undefined) delete process.env.VALUATION_HISTORY_BROWSER_READS;
  else process.env.VALUATION_HISTORY_BROWSER_READS = originalBrowserReads;
  if (originalImportContextTokenHash === undefined) delete process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256;
  else process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256 = originalImportContextTokenHash;
});

const validProviderResponse = (label = "Base case.", usage?: Record<string, number>) =>
  JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            base: {
              revenueGrowth: 8,
              operatingMargin: 24,
              discountRate: 9,
              terminalGrowth: 2.5,
              rationale: label,
            },
            bull: {
              revenueGrowth: 12,
              operatingMargin: 28,
              discountRate: 8,
              terminalGrowth: 3,
              rationale: "Bull case.",
            },
            bear: {
              revenueGrowth: 3,
              operatingMargin: 18,
              discountRate: 11,
              terminalGrowth: 1.5,
              rationale: "Bear case.",
            },
          }),
        },
      },
    ],
    ...(usage ? { usage } : {}),
  });

const providerResponseForAnalysis = (analysis: unknown) =>
  JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify(analysis),
        },
      },
    ],
  });

describe("AI scenario analysis route", () => {
  test("accepts strict base bull bear scenario output", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(
        validProviderResponse(),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.101" },
        body: JSON.stringify({ symbol: "AAPL" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.revenueGrowth).toBe(8);
    expect(payload.analysis.bear.rationale).toBe("Bear case.");
    expect(payload.cached).toBe(false);
    expect(payload.admin).toBe(false);
    expect(payload.tokenUsage.inputTokens).toBeGreaterThan(0);
    expect(payload.tokenUsage.estimated).toBe(true);
    expect(payload.tokenUsage.tokenizer).toBe("local-estimate-v1");
  });

  test("uses provider prompt token usage when the router returns it", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(
        validProviderResponse("Provider token usage case.", { prompt_tokens: 12345 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.135" },
        body: JSON.stringify({ symbol: "TOKEN" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tokenUsage.inputTokens).toBe(12345);
    expect(payload.tokenUsage.estimated).toBe(false);
    expect(payload.tokenUsage.tokenizer).toBe("provider-usage");
  });

  test("rejects malformed provider output without fallback", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ base: {} }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.102" },
        body: JSON.stringify({ symbol: "MALFORMED" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.code).toBe("AI_RESPONSE_INVALID");
  });

  test("accepts provider output wrapped in an analysis key", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(
        providerResponseForAnalysis({
          analysis: {
            base: {
              revenueGrowth: 7,
              operatingMargin: 25,
              discountRate: 9,
              terminalGrowth: 2.5,
              rationale: "Wrapped base.",
            },
            bull: {
              revenueGrowth: 11,
              operatingMargin: 28,
              discountRate: 8,
              terminalGrowth: 3,
              rationale: "Wrapped bull.",
            },
            bear: {
              revenueGrowth: 3,
              operatingMargin: 18,
              discountRate: 11,
              terminalGrowth: 1.5,
              rationale: "Wrapped bear.",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.129" },
        body: JSON.stringify({ symbol: "AAPL", wrapper: "analysis" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Wrapped base.");
  });

  test("requests JSON output with maximum reasoning controls", async () => {
    process.env.HUGGING_FACE_MODEL = "deepseek-ai/DeepSeek-V4-Pro";
    let providerBody: Record<string, unknown> | null = null;
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(validProviderResponse("Strict schema case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.120" },
        body: JSON.stringify({ symbol: "AAPL" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(providerBody?.model).toBe("deepseek-ai/DeepSeek-V4-Pro");
    expect(providerBody?.reasoning_effort).toBe("xhigh");
    expect(providerBody?.max_tokens).toBe(8192);
    expect(providerBody?.temperature).toBe(1);
    expect(providerBody?.top_p).toBe(1);
    expect(providerBody?.response_format).toEqual({ type: "json_object" });
  });

  test("enriches the model prompt with import context only when the import token is present", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256 = sha256Hex("correct-token");
    const importedFacts = {
      listingId: "sec:0000320193:AAPL",
      symbol: "AAPL",
      artifactIds: ["artifact-1"],
      facts: { statements: [{ periodEnd: "2025-09-30", revenue: 395000 }] },
      provenance: { sourceSystem: "convex-import" },
    };
    const calledQueries: string[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      calledQueries.push(String(name));
      if (String(name) === "imports:getImportedFacts") {
        expect(args).toEqual({ listingId: "sec:0000320193:AAPL" });
        return importedFacts;
      }
      if (String(name) === "companies:get") {
        expect(args).toEqual({ symbol: "AAPL" });
        return { symbol: "AAPL", name: "Apple Inc.", cik: "0000320193", source: "edgar" };
      }
      if (String(name) === "companyStatements:listBySymbol") {
        expect(args).toEqual({ symbol: "AAPL", limit: 10 });
        return {
          statements: [{ periodEnd: "2025-09-30", revenue: 395000, operatingMargin: 0.31 }],
          nextCursor: null,
        };
      }
      if (String(name) === "imports:listArtifactsForListing") {
        expect(args).toEqual({
          listingId: "sec:0000320193:AAPL",
          status: "approved",
          limit: 20,
        });
        return [
          { artifactId: "artifact-1", status: "approved", originalFilename: "aapl.xlsx" },
          { artifactId: "artifact-2", status: "approved", originalFilename: "ignored.xlsx" },
        ];
      }
      if (String(name) === "valuations:listByTicker") {
        expect(args).toEqual({ syncToken: "sync-token", symbol: "AAPL", limit: 5 });
        return [{ _id: "run-1", symbol: "AAPL", status: "success" }];
      }
      if (String(name) === "valuations:get") {
        throw new Error("Public import-context requests must not fetch saved-run traces");
      }
      if (String(name) === "seed:getReference") {
        expect(args).toEqual({});
        return { datasets: [{ key: "wacc", defaultRegionCode: "us", dataType: "industry" }], regions: [], datasetMappings: [] };
      }
      return null;
    };

    let prompt = "";
    globalThis.fetch = createMockFetch(async (_url, init) => {
      const providerBody = JSON.parse(String(init?.body)) as {
        messages?: Array<{ role: string; content: string }>;
      };
      prompt = providerBody.messages?.find((message) => message.role === "user")?.content ?? "";
      return new Response(validProviderResponse("Convex context case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.123",
          "x-import-context-token": "correct-token",
        },
        body: JSON.stringify({
          company: { id: "sec:0000320193:AAPL", symbol: "AAPL" },
          currentAssumptions: { base: { revenueGrowth: 5 } },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calledQueries).toContain("valuations:listByTicker");
    expect(calledQueries).not.toContain("valuations:get");
    expect(prompt).toContain("convexContext.importedFacts means approved user-reviewed facts");
    expect(prompt).toContain("convexContext.companyStatementHistory means cached annual/company statement facts");
    expect(prompt).toContain("\"convexContext\"");
    expect(prompt).toContain("\"companyCache\"");
    expect(prompt).toContain("\"companyStatementHistory\"");
    expect(prompt).toContain("\"operatingMargin\":0.31");
    expect(prompt).toContain("\"sourceSystem\":\"convex-import\"");
    expect(prompt).toContain("\"originalFilename\":\"aapl.xlsx\"");
    expect(prompt).not.toContain("ignored.xlsx");
    expect(prompt).toContain("\"recentValuationRuns\"");
    expect(prompt).toContain("\"latestValuationRunDetail\":null");
    expect(prompt).toContain("\"referenceDataCatalog\"");
    expect(prompt).toContain("currentAssumptions was intentionally withheld");
    expect(prompt).not.toContain("\"currentAssumptions\"");
  });

  test("includes saved-run trace detail only for valid admin AI requests", async () => {
    const calledQueries: string[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      calledQueries.push(String(name));
      if (String(name) === "companies:get") {
        expect(args).toEqual({ symbol: "ADMTRACE" });
        return { symbol: "ADMTRACE", name: "Admin Trace Co.", source: "edgar" };
      }
      if (String(name) === "companyStatements:listBySymbol") {
        expect(args).toEqual({ symbol: "ADMTRACE", limit: 10 });
        return { statements: [], nextCursor: null };
      }
      if (String(name) === "valuations:listByTicker") {
        expect(args).toEqual({ syncToken: "sync-token", symbol: "ADMTRACE", limit: 5 });
        return [{ _id: "run-admin", symbol: "ADMTRACE", status: "success" }];
      }
      if (String(name) === "valuations:get") {
        expect(args).toEqual({ syncToken: "sync-token", runId: "run-admin", includeTrace: true });
        return {
          run: { _id: "run-admin", symbol: "ADMTRACE" },
          trace: {
            trace: {
              base: { valuation: { fairValuePerShare: 42 } },
              bull: { valuation: { fairValuePerShare: 55 } },
              bear: { valuation: { fairValuePerShare: 30 } },
              monteCarlo: { summary: { p10: 31, p90: 54 }, histogram: { density: [1] } },
              kpis: { history: [{ year: 2025, revenue: 100 }] },
            },
          },
        };
      }
      if (String(name) === "seed:getReference") {
        return { datasets: [], regions: [], datasetMappings: [] };
      }
      return null;
    };

    let prompt = "";
    globalThis.fetch = createMockFetch(async (_url, init) => {
      const providerBody = JSON.parse(String(init?.body)) as {
        messages?: Array<{ role: string; content: string }>;
      };
      prompt = providerBody.messages?.find((message) => message.role === "user")?.content ?? "";
      return new Response(validProviderResponse("Admin trace context."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.138",
          "x-dcf-admin-token": validAdminToken,
        },
        body: JSON.stringify({
          company: { id: "sec:0000000000:ADMTRACE", symbol: "ADMTRACE" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calledQueries).toContain("valuations:listByTicker");
    expect(calledQueries).toContain("valuations:get");
    expect(prompt).toContain("\"latestValuationRunDetail\"");
    expect(prompt).toContain("\"fairValuePerShare\":42");
    expect(prompt).toContain("\"p90\":54");
    expect(prompt).toContain("\"kpis\"");
  });

  test("keeps private Convex context out of public AI requests unless browser reads are enabled", async () => {
    delete process.env.VALUATION_HISTORY_BROWSER_READS;
    let queryCount = 0;
    ConvexHttpClient.prototype.query = async () => {
      queryCount += 1;
      throw new Error("Convex should not be queried for public AI context");
    };

    let prompt = "";
    globalThis.fetch = createMockFetch(async (_url, init) => {
      const providerBody = JSON.parse(String(init?.body)) as {
        messages?: Array<{ role: string; content: string }>;
      };
      prompt = providerBody.messages?.find((message) => message.role === "user")?.content ?? "";
      return new Response(validProviderResponse("No private Convex context."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.136" },
        body: JSON.stringify({
          company: { id: "sec:0000320193:AAPL", symbol: "AAPL" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(queryCount).toBe(0);
    expect(prompt).toContain("\"reason\":\"BROWSER_READS_DISABLED\"");
  });

  test("keeps imported facts out of public AI context without the import context token", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256 = sha256Hex("correct-token");
    const calledQueries: string[] = [];
    ConvexHttpClient.prototype.query = async (name) => {
      calledQueries.push(String(name));
      if (String(name) === "companies:get") {
        return { symbol: "AAPL", name: "Apple Inc.", cik: "0000320193", source: "edgar" };
      }
      if (String(name) === "companyStatements:listBySymbol") {
        return { statements: [{ periodEnd: "2025-09-30", revenue: 395000 }], nextCursor: null };
      }
      if (String(name) === "seed:getReference") {
        return { datasets: [], regions: [], datasetMappings: [] };
      }
      if (String(name) === "valuations:listByTicker") {
        return [
          {
            _id: "run-public",
            createdAt: 1700000000000,
            status: "success",
            symbol: "AAPL",
            resultSummary: { base: { fairValuePerShare: 123 } },
            normalizedInputs: { revenueGrowth: 0.12 },
            provenance: { source: "private cache" },
            primaryKeyNorm: "private-key",
            regionCode: "private-region",
            traceStorage: "inline",
            traceByteSize: 9000,
          },
        ];
      }
      if (String(name) === "valuations:get") {
        throw new Error("Public AI context must not fetch saved-run detail");
      }
      throw new Error(`Unexpected import-context query without token: ${String(name)}`);
    };

    let prompt = "";
    globalThis.fetch = createMockFetch(async (_url, init) => {
      const providerBody = JSON.parse(String(init?.body)) as {
        messages?: Array<{ role: string; content: string }>;
      };
      prompt = providerBody.messages?.find((message) => message.role === "user")?.content ?? "";
      return new Response(validProviderResponse("No import context token."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.137" },
        body: JSON.stringify({
          company: { id: "sec:0000320193:AAPL", symbol: "AAPL" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calledQueries).toContain("companies:get");
    expect(calledQueries).toContain("companyStatements:listBySymbol");
    expect(calledQueries).not.toContain("imports:getImportedFacts");
    expect(calledQueries).not.toContain("imports:listBySymbol");
    expect(calledQueries).not.toContain("imports:listArtifactsForListing");
    expect(calledQueries).toContain("valuations:listByTicker");
    expect(calledQueries).not.toContain("valuations:get");
    expect(prompt).toContain("\"companyCache\"");
    expect(prompt).toContain("\"companyStatementHistory\"");
    expect(prompt).toContain("\"importedFacts\":null");
    expect(prompt).toContain("\"importArtifacts\":[]");
    expect(prompt).toContain("\"fairValuePerShare\":123");
    expect(prompt).not.toContain("normalizedInputs");
    expect(prompt).not.toContain("private cache");
    expect(prompt).not.toContain("private-key");
    expect(prompt).not.toContain("traceByteSize");
  });

  test("sends a detailed valuation analyst system prompt", async () => {
    let systemPrompt = "";
    globalThis.fetch = createMockFetch(async (_url, init) => {
      const providerBody = JSON.parse(String(init?.body)) as {
        messages?: Array<{ role: string; content: string }>;
      };
      systemPrompt = providerBody.messages?.find((message) => message.role === "system")?.content ?? "";
      return new Response(validProviderResponse("System prompt case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.124" },
        body: JSON.stringify({ company: { symbol: "AAPL" } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(systemPrompt).toContain("Evidence hierarchy");
    expect(systemPrompt).toContain("Convex context contract");
    expect(systemPrompt).toContain("Scenario construction rules");
    expect(systemPrompt).toContain("Strict output rules");
    expect(systemPrompt).toContain("Treat EDGAR/provenance-backed facts and manually approved import facts as stronger evidence");
    expect(systemPrompt).toContain("Maintain ordering");
    expect(systemPrompt).toContain("Do not copy generic dashboard defaults");
    expect(systemPrompt).toContain(
      "Do not cite forecast projections generated from current assumptions as if they were historical realized growth",
    );
    expect(systemPrompt).toContain("Do not cite product launches, AI catalysts, segment mix");
    expect(systemPrompt).toContain("Do not use engine KPI wacc as evidence");
    expect(systemPrompt).toContain("Do not invent exact facts");
    expect(systemPrompt).toContain("Do not reveal chain-of-thought");
  });

  test("retries without reasoning effort when provider returns no final content", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: null, reasoning_content: "..." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Retry case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.125" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "malformed-content" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Retry case.");
    expect(providerBodies).toHaveLength(2);
    expect(providerBodies[0].reasoning_effort).toBe("xhigh");
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
    expect(JSON.stringify(providerBodies[1])).toContain("Use concise private reasoning");
    expect(JSON.stringify(providerBodies[1])).not.toContain("Use maximum private reasoning effort");
  });

  test("marks forbidden current dashboard values as non-evidence in retry prompts", async () => {
    const currentAssumptions = {
      base: { revenueGrowth: 5, operatingMargin: 28, discountRate: 9, terminalGrowth: 2.5 },
      bull: { revenueGrowth: 8, operatingMargin: 33, discountRate: 8, terminalGrowth: 3 },
      bear: { revenueGrowth: 3, operatingMargin: 24, discountRate: 10, terminalGrowth: 1 },
    };
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    base: { ...currentAssumptions.base, rationale: "No-op." },
                    bull: { ...currentAssumptions.bull, rationale: "No-op." },
                    bear: { ...currentAssumptions.bear, rationale: "No-op." },
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Non-evidence retry case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.132" },
        body: JSON.stringify({
          company: { symbol: "AAPL" },
          activeScenario: "base",
          currentAssumptions,
        }),
      }),
    );
    const retryPrompt = (
      providerBodies[1].messages as Array<{ role: string; content: string }>
    ).find((message) => message.role === "user")?.content ?? "";

    expect(response.status).toBe(200);
    expect(retryPrompt).toContain("forbidden current dashboard values are not evidence");
    expect(retryPrompt).toContain("must not be cited in rationale");
    expect(retryPrompt).toContain("KPI values");
    expect(retryPrompt).toContain("historical facts");
  });

  test("retries without reasoning effort when provider returns a transient server error", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          JSON.stringify({ error: { message: "upstream timeout" } }),
          { status: 504, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Server error retry case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.127" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "provider-504" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Server error retry case.");
    expect(providerBodies).toHaveLength(2);
    expect(providerBodies[0].reasoning_effort).toBe("xhigh");
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
  });

  test("does not retry provider request timeouts", async () => {
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.130" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "provider-timeout" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload.message).toBe("AI analysis failed");
    expect(providerCalls).toBe(1);
  });

  test("retries provider input-validation errors with a simpler compatible request", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          JSON.stringify({ error: { message: "Input validation error" } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Compatible retry case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.131" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "input-validation" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Compatible retry case.");
    expect(providerBodies).toHaveLength(2);
    expect(providerBodies[0].reasoning_effort).toBe("xhigh");
    expect(providerBodies[0].response_format).toEqual({ type: "json_object" });
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
    expect(providerBodies[1].response_format).toBeUndefined();
  });

  test("uses compact fallback when provider keeps returning transient server errors", async () => {
    process.env.HUGGING_FACE_MAX_OUTPUT_TOKENS = "4096";
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length < 3) {
        return new Response(
          JSON.stringify({ error: { message: "router overloaded" } }),
          { status: 504, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Compact fallback case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.128" },
        body: JSON.stringify({
          company: { symbol: "AAPL" },
          currentAssumptions: {
            base: { revenueGrowth: 12, operatingMargin: 25, discountRate: 10, terminalGrowth: 2.5 },
            bull: { revenueGrowth: 14, operatingMargin: 27, discountRate: 9, terminalGrowth: 3 },
            bear: { revenueGrowth: 6, operatingMargin: 18, discountRate: 12, terminalGrowth: 1.5 },
          },
          retry: "provider-504-compact",
        }),
      }),
    );
    const payload = await response.json();
    const compactPrompt = (
      providerBodies[2].messages as Array<{ role: string; content: string }>
    ).find((message) => message.role === "user")?.content ?? "";

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Compact fallback case.");
    expect(providerBodies).toHaveLength(3);
    expect(providerBodies[0].reasoning_effort).toBe("xhigh");
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
    expect(providerBodies[2].reasoning_effort).toBeUndefined();
    expect(providerBodies[2].response_format).toEqual({ type: "json_object" });
    expect(providerBodies[2].max_tokens).toBe(4096);
    expect(providerBodies[2].temperature).toBe(0.4);
    expect(compactPrompt).toContain("Return only a JSON object");
    expect(compactPrompt).toContain("Answer immediately with the final JSON");
    expect(compactPrompt).toContain("active scenario");
    expect(compactPrompt).not.toContain("\"currentAssumptions\"");
  });

  test("uses compact fallback when provider keeps returning no final content", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length < 3) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: null, reasoning_content: "..." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Compact malformed fallback case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.129" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "malformed-compact" }),
      }),
    );
    const payload = await response.json();
    const compactPrompt = (
      providerBodies[2].messages as Array<{ role: string; content: string }>
    ).find((message) => message.role === "user")?.content ?? "";

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Compact malformed fallback case.");
    expect(providerBodies).toHaveLength(3);
    expect(providerBodies[0].reasoning_effort).toBe("xhigh");
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
    expect(providerBodies[2].reasoning_effort).toBeUndefined();
    expect(providerBodies[2].response_format).toEqual({ type: "json_object" });
    expect(providerBodies[2].max_tokens).toBe(8192);
    expect(compactPrompt).toContain("Return only a JSON object");
    expect(compactPrompt).toContain("Answer immediately with the final JSON");
  });

  test("retries without reasoning effort when provider returns invalid response shape", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ analysis: "bad" }) } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Invalid shape retry case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.130" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "invalid-shape" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Invalid shape retry case.");
    expect(providerBodies).toHaveLength(2);
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
  });

  test("retries when rationale cites unsupported context", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          providerResponseForAnalysis({
            base: {
              revenueGrowth: 8,
              operatingMargin: 24,
              discountRate: 9,
              terminalGrowth: 2.5,
              rationale: "Base relies on an AI product cycle.",
            },
            bull: {
              revenueGrowth: 12,
              operatingMargin: 28,
              discountRate: 8,
              terminalGrowth: 3,
              rationale: "Bull case.",
            },
            bear: {
              revenueGrowth: 3,
              operatingMargin: 18,
              discountRate: 11,
              terminalGrowth: 1.5,
              rationale: "Bear case.",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Grounded statement trend case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.134" },
        body: JSON.stringify({
          company: { symbol: "AAPL" },
          financials: { statementTrends: { latestRevenueGrowthPct: 6.4 } },
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(providerBodies).toHaveLength(2);
    expect(payload.analysis.base.rationale).toBe("Grounded statement trend case.");
  });

  test("uses compact fallback when provider keeps returning invalid response shape", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length < 3) {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ analysis: "bad" }) } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Compact invalid-shape fallback case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.132" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "invalid-shape-compact" }),
      }),
    );
    const payload = await response.json();
    const compactPrompt = (
      providerBodies[2].messages as Array<{ role: string; content: string }>
    ).find((message) => message.role === "user")?.content ?? "";

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Compact invalid-shape fallback case.");
    expect(providerBodies).toHaveLength(3);
    expect(providerBodies[0].reasoning_effort).toBe("xhigh");
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
    expect(providerBodies[2].reasoning_effort).toBeUndefined();
    expect(providerBodies[2].response_format).toEqual({ type: "json_object" });
    expect(compactPrompt).toContain("Return only a JSON object");
  });

  test("retries when provider returns assumptions outside dashboard bounds", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          providerResponseForAnalysis({
            base: {
              revenueGrowth: 45,
              operatingMargin: 24,
              discountRate: 9,
              terminalGrowth: 2.5,
              rationale: "Out of bounds base.",
            },
            bull: {
              revenueGrowth: 50,
              operatingMargin: 28,
              discountRate: 8,
              terminalGrowth: 3,
              rationale: "Out of bounds bull.",
            },
            bear: {
              revenueGrowth: 3,
              operatingMargin: 18,
              discountRate: 11,
              terminalGrowth: 1.5,
              rationale: "Bear case.",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Bounds retry case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.131" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "bounds" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Bounds retry case.");
    expect(providerBodies).toHaveLength(2);
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
  });

  test("retries when provider breaks bull base bear ordering", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          providerResponseForAnalysis({
            base: {
              revenueGrowth: 8,
              operatingMargin: 24,
              discountRate: 9,
              terminalGrowth: 2.5,
              rationale: "Base case.",
            },
            bull: {
              revenueGrowth: 6,
              operatingMargin: 28,
              discountRate: 8,
              terminalGrowth: 3,
              rationale: "Bull has lower growth than base.",
            },
            bear: {
              revenueGrowth: 3,
              operatingMargin: 18,
              discountRate: 11,
              terminalGrowth: 1.5,
              rationale: "Bear case.",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Ordering retry case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.132" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "ordering" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Ordering retry case.");
    expect(providerBodies).toHaveLength(2);
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
  });

  test("retries when provider reverses terminal growth ordering", async () => {
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          providerResponseForAnalysis({
            base: {
              revenueGrowth: 8,
              operatingMargin: 24,
              discountRate: 9,
              terminalGrowth: 2.5,
              rationale: "Base case.",
            },
            bull: {
              revenueGrowth: 12,
              operatingMargin: 28,
              discountRate: 8,
              terminalGrowth: 2,
              rationale: "Bull terminal growth below base.",
            },
            bear: {
              revenueGrowth: 3,
              operatingMargin: 18,
              discountRate: 11,
              terminalGrowth: 1.5,
              rationale: "Bear case.",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(validProviderResponse("Terminal ordering retry case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.137" },
        body: JSON.stringify({ company: { symbol: "AAPL" }, retry: "terminal-ordering" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.rationale).toBe("Terminal ordering retry case.");
    expect(providerBodies).toHaveLength(2);
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
  });

  test("retries when provider echoes current assumptions unchanged", async () => {
    const currentAssumptions = {
      base: { revenueGrowth: 12, operatingMargin: 25, discountRate: 10, terminalGrowth: 2.5 },
      bull: { revenueGrowth: 18, operatingMargin: 30, discountRate: 8, terminalGrowth: 3 },
      bear: { revenueGrowth: 6, operatingMargin: 18, discountRate: 14, terminalGrowth: 2 },
    };
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          providerResponseForAnalysis({
            base: { ...currentAssumptions.base, rationale: "Current base." },
            bull: { ...currentAssumptions.bull, rationale: "Current bull." },
            bear: { ...currentAssumptions.bear, rationale: "Current bear." },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        providerResponseForAnalysis({
          base: {
            revenueGrowth: 9,
            operatingMargin: 27,
            discountRate: 9.5,
            terminalGrowth: 2.7,
            rationale: "Adjusted base.",
          },
          bull: {
            revenueGrowth: 14,
            operatingMargin: 32,
            discountRate: 8,
            terminalGrowth: 3.1,
            rationale: "Adjusted bull.",
          },
          bear: {
            revenueGrowth: 4,
            operatingMargin: 20,
            discountRate: 12,
            terminalGrowth: 1.8,
            rationale: "Adjusted bear.",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.126" },
        body: JSON.stringify({
          company: { symbol: "AAPL" },
          currentAssumptions,
          retry: "still-unchanged",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.revenueGrowth).toBe(9);
    expect(providerBodies).toHaveLength(2);
    expect(providerBodies[0].reasoning_effort).toBe("xhigh");
    expect(providerBodies[1].reasoning_effort).toBeUndefined();
    const retryPrompt = (providerBodies[1].messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user",
    )?.content;
    expect(retryPrompt).toContain("previous output did not visibly change the active dashboard scenario");
    expect(retryPrompt).toContain("base: revenueGrowth=12");
    expect(retryPrompt).not.toContain("\"currentAssumptions\"");
  });

  test("rejects forced retries that still echo current assumptions unchanged", async () => {
    const currentAssumptions = {
      base: { revenueGrowth: 12, operatingMargin: 25, discountRate: 10, terminalGrowth: 2.5 },
      bull: { revenueGrowth: 18, operatingMargin: 30, discountRate: 8, terminalGrowth: 3 },
      bear: { revenueGrowth: 6, operatingMargin: 18, discountRate: 14, terminalGrowth: 2 },
    };
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        providerResponseForAnalysis({
          base: { ...currentAssumptions.base, rationale: "Still current base." },
          bull: { ...currentAssumptions.bull, rationale: "Still current bull." },
          bear: { ...currentAssumptions.bear, rationale: "Still current bear." },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.127" },
        body: JSON.stringify({
          company: { symbol: "AAPL" },
          currentAssumptions,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.code).toBe("AI_RESPONSE_INVALID");
    expect(providerBodies).toHaveLength(2);
  });

  test("retries when provider leaves the active scenario unchanged", async () => {
    const currentAssumptions = {
      base: { revenueGrowth: 12, operatingMargin: 25, discountRate: 10, terminalGrowth: 2.5 },
      bull: { revenueGrowth: 18, operatingMargin: 30, discountRate: 8, terminalGrowth: 3 },
      bear: { revenueGrowth: 6, operatingMargin: 18, discountRate: 14, terminalGrowth: 2 },
    };
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          providerResponseForAnalysis({
            base: { ...currentAssumptions.base, rationale: "Unchanged active base." },
            bull: {
              revenueGrowth: 20,
              operatingMargin: 32,
              discountRate: 7.5,
              terminalGrowth: 3.2,
              rationale: "Changed bull.",
            },
            bear: {
              revenueGrowth: 4,
              operatingMargin: 20,
              discountRate: 12,
              terminalGrowth: 1.8,
              rationale: "Changed bear.",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        providerResponseForAnalysis({
          base: {
            revenueGrowth: 9,
            operatingMargin: 26,
            discountRate: 9.5,
            terminalGrowth: 2.6,
            rationale: "Changed active base.",
          },
          bull: {
            revenueGrowth: 14,
            operatingMargin: 32,
            discountRate: 8,
            terminalGrowth: 3.1,
            rationale: "Adjusted bull.",
          },
          bear: {
            revenueGrowth: 4,
            operatingMargin: 20,
            discountRate: 12,
            terminalGrowth: 1.8,
            rationale: "Adjusted bear.",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.128" },
        body: JSON.stringify({
          company: { symbol: "AAPL" },
          activeScenario: "base",
          currentAssumptions,
          retry: "terminal-growth-only",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.revenueGrowth).toBe(9);
    expect(providerBodies).toHaveLength(2);
    const retryPrompt = (providerBodies[1].messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user",
    )?.content;
    expect(retryPrompt).toContain("active dashboard scenario (base)");
    expect(retryPrompt).toContain("a terminal-growth-only tweak is not enough");
  });

  test("retries when active scenario only changes terminal growth", async () => {
    const currentAssumptions = {
      base: { revenueGrowth: 12, operatingMargin: 25, discountRate: 10, terminalGrowth: 2.5 },
      bull: { revenueGrowth: 18, operatingMargin: 30, discountRate: 8, terminalGrowth: 3 },
      bear: { revenueGrowth: 6, operatingMargin: 18, discountRate: 14, terminalGrowth: 2 },
    };
    const providerBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (providerBodies.length === 1) {
        return new Response(
          providerResponseForAnalysis({
            base: {
              ...currentAssumptions.base,
              terminalGrowth: 3,
              rationale: "Only terminal growth moved.",
            },
            bull: {
              revenueGrowth: 20,
              operatingMargin: 32,
              discountRate: 7.5,
              terminalGrowth: 3.2,
              rationale: "Changed bull.",
            },
            bear: {
              revenueGrowth: 4,
              operatingMargin: 20,
              discountRate: 12,
              terminalGrowth: 1.8,
              rationale: "Changed bear.",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        providerResponseForAnalysis({
          base: {
            revenueGrowth: 9,
            operatingMargin: 26,
            discountRate: 9.5,
            terminalGrowth: 2.8,
            rationale: "Materially changed active base.",
          },
          bull: {
            revenueGrowth: 14,
            operatingMargin: 32,
            discountRate: 8,
            terminalGrowth: 3.1,
            rationale: "Adjusted bull.",
          },
          bear: {
            revenueGrowth: 4,
            operatingMargin: 20,
            discountRate: 12,
            terminalGrowth: 1.8,
            rationale: "Adjusted bear.",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.133" },
        body: JSON.stringify({
          company: { symbol: "AAPL" },
          activeScenario: "base",
          currentAssumptions,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.analysis.base.revenueGrowth).toBe(9);
    expect(providerBodies).toHaveLength(2);
    const retryPrompt = (providerBodies[1].messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user",
    )?.content;
    expect(retryPrompt).toContain("a terminal-growth-only tweak is not enough");
  });

  test("can request strict schema output when the provider supports it", async () => {
    process.env.HUGGING_FACE_RESPONSE_FORMAT = "json_schema";
    let providerBody: Record<string, unknown> | null = null;
    globalThis.fetch = createMockFetch(async (_url, init) => {
      providerBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(validProviderResponse("Strict schema opt-in."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.122" },
        body: JSON.stringify({ symbol: "AAPL", variant: "schema" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(providerBody?.response_format).toEqual({
      type: "json_schema",
      json_schema: expect.objectContaining({
        name: "dcf_scenario_analysis",
        strict: true,
        schema: expect.objectContaining({
          required: ["base", "bull", "bear"],
        }),
      }),
    });
  });

  test("returns cached analysis for repeated matching valuation context", async () => {
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse("Cached base case."), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const request = () =>
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.103" },
        body: JSON.stringify({ symbol: "MSFT", filingPeriod: "2025" }),
      });

    const first = await POST(request());
    const second = await POST(request());
    const firstPayload = await first.json();
    const secondPayload = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstPayload.cached).toBe(false);
    expect(secondPayload.cached).toBe(true);
    expect(providerCalls).toBe(1);
  });

  test("enforces public daily cap without blocking admin mode", async () => {
    process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY = "1";
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse(`Call ${providerCalls}.`), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const first = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.104" },
        body: JSON.stringify({ symbol: "NVDA", run: 1 }),
      }),
    );
    const second = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.105" },
        body: JSON.stringify({ symbol: "NVDA", run: 2 }),
      }),
    );
    const admin = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.106",
          "x-dcf-admin-token": validAdminToken,
        },
        body: JSON.stringify({ symbol: "NVDA", run: 3 }),
      }),
    );
    const adminPayload = await admin.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(admin.status).toBe(200);
    expect(adminPayload.admin).toBe(true);
  });

  test("does not accept the configured SHA-256 digest as the admin token", async () => {
    process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY = "1";
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse(`Digest test ${providerCalls}.`), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const first = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.108" },
        body: JSON.stringify({ symbol: "HASHCHECK", run: 1 }),
      }),
    );
    const hashAsToken = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.109",
          "x-dcf-admin-token": process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 ?? "",
        },
        body: JSON.stringify({ symbol: "HASHCHECK", run: 2 }),
      }),
    );
    const validRawToken = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.110",
          "x-dcf-admin-token": validAdminToken,
        },
        body: JSON.stringify({ symbol: "HASHCHECK", run: 3 }),
      }),
    );
    const validRawTokenPayload = await validRawToken.json();

    expect(first.status).toBe(200);
    expect(hashAsToken.status).toBe(429);
    expect(validRawToken.status).toBe(200);
    expect(validRawTokenPayload.admin).toBe(true);
    expect(providerCalls).toBe(2);
  });

  test("does not let invalid admin tokens bypass the daily cap", async () => {
    process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY = "1";
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse(`Invalid admin ${providerCalls}.`), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const first = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.111" },
        body: JSON.stringify({ symbol: "BADADMIN", run: 1 }),
      }),
    );
    const invalidAdmin = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.112",
          "x-dcf-admin-token": "wrong-admin-token-123",
        },
        body: JSON.stringify({ symbol: "BADADMIN", run: 2 }),
      }),
    );
    const invalidAdminPayload = await invalidAdmin.json();

    expect(first.status).toBe(200);
    expect(invalidAdmin.status).toBe(429);
    expect(invalidAdminPayload.code).toBe("RATE_LIMITED");
    expect(providerCalls).toBe(1);
  });

  test("lets valid admin mode bypass per-IP minute caps without disabling payload checks", async () => {
    process.env.API_RATE_LIMIT_AI_SCENARIO_PER_MINUTE = "1";
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse(`Minute cap ${providerCalls}.`), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const publicFirst = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.113" },
        body: JSON.stringify({ symbol: "MINCAP", run: 1 }),
      }),
    );
    const publicSecond = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.113" },
        body: JSON.stringify({ symbol: "MINCAP", run: 2 }),
      }),
    );
    const adminFirst = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.113",
          "x-dcf-admin-token": validAdminToken,
        },
        body: JSON.stringify({ symbol: "MINCAP", run: 3 }),
      }),
    );
    const adminOversized = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.113",
          "x-dcf-admin-token": validAdminToken,
        },
        body: JSON.stringify({ symbol: "MINCAP", blob: "x".repeat(33_000) }),
      }),
    );

    expect(publicFirst.status).toBe(200);
    expect(publicSecond.status).toBe(429);
    expect(adminFirst.status).toBe(200);
    expect(adminOversized.status).toBe(413);
    expect(providerCalls).toBe(2);
  });

  test("disables admin bypass when the configured admin hash is malformed", async () => {
    process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY = "1";
    process.env.DCF_DEMO_ADMIN_TOKEN_SHA256 = "not-a-valid-sha256";
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse(`Malformed config ${providerCalls}.`), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const first = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.114" },
        body: JSON.stringify({ symbol: "BADCONFIG", run: 1 }),
      }),
    );
    const malformedAdmin = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: {
          "x-vercel-forwarded-for": "203.0.113.115",
          "x-dcf-admin-token": validAdminToken,
        },
        body: JSON.stringify({ symbol: "BADCONFIG", run: 2 }),
      }),
    );

    expect(first.status).toBe(200);
    expect(malformedAdmin.status).toBe(429);
    expect(providerCalls).toBe(1);
  });

  test("rejects oversized AI payloads before provider calls", async () => {
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse(), { status: 200 });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.107" },
        body: JSON.stringify({ symbol: "AAPL", blob: "x".repeat(33_000) }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.code).toBe("PAYLOAD_TOO_LARGE");
    expect(providerCalls).toBe(0);
  });

  test("allows larger valuation context when the input byte cap is raised", async () => {
    process.env.HUGGING_FACE_MAX_INPUT_BYTES = "40000";
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse("Large context case."), { status: 200 });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.121" },
        body: JSON.stringify({ symbol: "AAPL", blob: "x".repeat(33_000) }),
      }),
    );

    expect(response.status).toBe(200);
    expect(providerCalls).toBe(1);
  });

  test("default input byte budget supports DeepSeek 384K-context scale", async () => {
    delete process.env.HUGGING_FACE_MAX_INPUT_BYTES;
    let providerCalls = 0;
    globalThis.fetch = createMockFetch(async () => {
      providerCalls += 1;
      return new Response(validProviderResponse("Default large context case."), { status: 200 });
    });

    const response = await POST(
      new Request("http://localhost/api/ai/scenario-analysis", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.123" },
        body: JSON.stringify({ symbol: "AAPL", blob: "x".repeat(2_100_000) }),
      }),
    );

    expect(response.status).toBe(200);
    expect(providerCalls).toBe(1);
  });
});
