/// <reference types="bun-types" />
import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";

import { resetRateLimitStateForTests } from "../../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./securityMutationsMock";

export { createMockFetch, asFetchMock } from "./fetchMock";

export const validAdminToken = "test-admin-token-123456";

export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const validProviderResponse = (label = "Base case.", usage?: Record<string, number>) =>
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

export const providerResponseForAnalysis = (analysis: unknown) =>
  JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify(analysis),
        },
      },
    ],
  });

export type AiScenarioEnvSnapshot = {
  hfKey?: string;
  hfModel?: string;
  convexUrl?: string;
  syncToken?: string;
  adminTokenHash?: string;
  dailyLimit?: string;
  minuteLimit?: string;
  maxInputBytes?: string;
  maxOutputTokens?: string;
  reasoningEffort?: string;
  responseFormat?: string;
  temperature?: string;
  topP?: string;
  browserReads?: string;
  importContextTokenHash?: string;
  nodeEnv?: string;
  debugEscape?: string;
};

export const defaultConvexQueryMock = async (name: unknown, args: unknown) => {
  if (String(name) === "imports:listBySymbol") {
    return [];
  }
  if (String(name) === "imports:listArtifactsForListing") {
    return [];
  }
  if (String(name) === "valuations:listByTicker") {
    return [];
  }
  if (String(name) === "companyStatements:listBySymbol") {
    return { statements: [], nextCursor: null };
  }
  return null;
};

export const installAiScenarioTestEnv = (options?: {
  convexQuery?: typeof ConvexHttpClient.prototype.query;
}) => {
  const snapshot: AiScenarioEnvSnapshot = {
    hfKey: process.env.HUGGING_FACE_API_KEY,
    hfModel: process.env.HUGGING_FACE_MODEL,
    convexUrl: process.env.CONVEX_URL,
    syncToken: process.env.DAMODARAN_SYNC_TOKEN,
    adminTokenHash: process.env.DCF_DEMO_ADMIN_TOKEN_SHA256,
    dailyLimit: process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY,
    minuteLimit: process.env.API_RATE_LIMIT_AI_SCENARIO_PER_MINUTE,
    maxInputBytes: process.env.HUGGING_FACE_MAX_INPUT_BYTES,
    maxOutputTokens: process.env.HUGGING_FACE_MAX_OUTPUT_TOKENS,
    reasoningEffort: process.env.HUGGING_FACE_REASONING_EFFORT,
    responseFormat: process.env.HUGGING_FACE_RESPONSE_FORMAT,
    temperature: process.env.HUGGING_FACE_TEMPERATURE,
    topP: process.env.HUGGING_FACE_TOP_P,
    browserReads: process.env.VALUATION_HISTORY_BROWSER_READS,
    importContextTokenHash: process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256,
    nodeEnv: process.env.NODE_ENV,
    debugEscape: process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES,
  };

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

  ConvexHttpClient.prototype.query = (options?.convexQuery ?? defaultConvexQueryMock) as unknown as ConvexHttpClient["query"];

  const securityMock = installSecurityMutationsMock();

  return {
    snapshot,
    restore: () => {
      resetRateLimitStateForTests();
      securityMock.restore();
      ConvexHttpClient.prototype.query = originalQuery;

      const restoreEnv = (key: keyof AiScenarioEnvSnapshot, envKey: string) => {
        const value = snapshot[key];
        if (value === undefined) delete process.env[envKey];
        else process.env[envKey] = value;
      };

      restoreEnv("hfKey", "HUGGING_FACE_API_KEY");
      restoreEnv("hfModel", "HUGGING_FACE_MODEL");
      restoreEnv("convexUrl", "CONVEX_URL");
      restoreEnv("syncToken", "DAMODARAN_SYNC_TOKEN");
      restoreEnv("adminTokenHash", "DCF_DEMO_ADMIN_TOKEN_SHA256");
      restoreEnv("dailyLimit", "API_RATE_LIMIT_AI_SCENARIO_DAILY");
      restoreEnv("minuteLimit", "API_RATE_LIMIT_AI_SCENARIO_PER_MINUTE");
      restoreEnv("maxInputBytes", "HUGGING_FACE_MAX_INPUT_BYTES");
      restoreEnv("maxOutputTokens", "HUGGING_FACE_MAX_OUTPUT_TOKENS");
      restoreEnv("reasoningEffort", "HUGGING_FACE_REASONING_EFFORT");
      restoreEnv("responseFormat", "HUGGING_FACE_RESPONSE_FORMAT");
      restoreEnv("temperature", "HUGGING_FACE_TEMPERATURE");
      restoreEnv("topP", "HUGGING_FACE_TOP_P");
      restoreEnv("browserReads", "VALUATION_HISTORY_BROWSER_READS");
      restoreEnv("importContextTokenHash", "IMPORT_CONTEXT_BROWSER_TOKEN_SHA256");
      restoreEnv("nodeEnv", "NODE_ENV");
      restoreEnv("debugEscape", "DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES");
    },
  };
};

const originalQuery = ConvexHttpClient.prototype.query;

export const sampleOrderedAnalysis = () => ({
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
});
