import type { AiTokenUsage } from "@/app/api/ai/_lib/tokenizer";
import type { Assumptions, Scenario } from "@/lib/workbench/scenarioProfiles";

export type ScenarioPayload = Assumptions & { rationale: string };
export type AnalysisPayload = Record<Scenario, ScenarioPayload>;

export type ConvexLookup = { listingId: string | null; symbol: string | null };

export type ConvexAiContext = {
  available: boolean;
  reason?: string;
  lookup: ConvexLookup;
  dataContract: ConvexDataContract;
  companyCache?: unknown | null;
  companyStatementHistory?: unknown[];
  importedFacts?: unknown | null;
  importArtifacts?: unknown[];
  recentValuationRuns?: unknown[];
  latestValuationRunDetail?: unknown | null;
  referenceDataCatalog?: unknown | null;
};

export type ConvexDataContract = {
  companyCache: string;
  companyStatementHistory: string;
  importedFacts: string;
  importArtifacts: string;
  recentValuationRuns: string;
  latestValuationRunDetail: string;
  referenceDataCatalog: string;
};

export type CachedScenarioAnalysis = {
  analysis: AnalysisPayload;
  tokenUsage: AiTokenUsage;
};

export const DEFAULT_MAX_AI_PAYLOAD_BYTES = 4_000_000;
export const DEFAULT_AI_MAX_TOKENS = 8_192;
export const DEFAULT_AI_TEMPERATURE = 1.0;
export const DEFAULT_AI_TOP_P = 1.0;
export const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const AI_SCENARIO_PROMPT_VERSION = "2026-05-06-grounded-statements-v4";

export const assumptionKeys = [
  "revenueGrowth",
  "operatingMargin",
  "discountRate",
  "terminalGrowth",
] as const;

export const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const dataContract: ConvexDataContract = {
  companyCache:
    "Cached company identity row from Convex companies, including symbol, name, CIK, country, currency, source, and updatedAt.",
  companyStatementHistory:
    "Latest cached companyStatements rows from Convex, ordered by period end descending, including revenue, operating income, operating margin, cash, debt, shares, filing date, currency, and source.",
  importedFacts:
    "Latest approved imported facts for the selected listing or symbol, including review/provenance/source links when present.",
  importArtifacts:
    "Approved import artifact metadata for the imported facts; storage ids are references only, not file contents.",
  recentValuationRuns:
    "Most recent Convex valuation run summaries for the symbol. Public requests include only id, createdAt, status, symbol, and resultSummary; admin requests may include richer run metadata.",
  latestValuationRunDetail:
    "Admin-only latest successful saved valuation run detail from Convex with trace included when available.",
  referenceDataCatalog:
    "Summary of available Convex reference datasets, regions, and mapping rules. This is a catalog, not the full tableData contents.",
};

const scenarioJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "revenueGrowth",
    "operatingMargin",
    "discountRate",
    "terminalGrowth",
    "rationale",
  ],
  properties: {
    revenueGrowth: { type: "number", minimum: -5, maximum: 30 },
    operatingMargin: { type: "number", minimum: 5, maximum: 60 },
    discountRate: { type: "number", minimum: 5, maximum: 20 },
    terminalGrowth: { type: "number", minimum: 0, maximum: 5 },
    rationale: { type: "string", minLength: 1 },
  },
} as const;

export const scenarioAnalysisResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "dcf_scenario_analysis",
    description: "DCF scenario assumptions and concise rationale for base, bull, and bear cases.",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["base", "bull", "bear"],
      properties: {
        base: scenarioJsonSchema,
        bull: scenarioJsonSchema,
        bear: scenarioJsonSchema,
      },
    },
  },
} as const;
