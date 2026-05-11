import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

import { isAdminModeRequest } from "@/app/api/_lib/adminMode";
import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  estimateChatInputTokens,
  withProviderPromptTokens,
  type AiTokenUsage,
  type ChatTokenMessage,
} from "@/app/api/ai/_lib/tokenizer";
import {
  enforceRateLimit,
  enforceGlobalRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import type { Assumptions, Scenario } from "@/lib/workbench/scenarioProfiles";

type ScenarioPayload = Assumptions & { rationale: string };
type AnalysisPayload = Record<Scenario, ScenarioPayload>;
type ConvexLookup = { listingId: string | null; symbol: string | null };
type ConvexAiContext = {
  available: boolean;
  reason?: string;
  lookup: ConvexLookup;
  dataContract: {
    companyCache: string;
    companyStatementHistory: string;
    importedFacts: string;
    importArtifacts: string;
    recentValuationRuns: string;
    latestValuationRunDetail: string;
    referenceDataCatalog: string;
  };
  companyCache?: unknown | null;
  companyStatementHistory?: unknown[];
  importedFacts?: unknown | null;
  importArtifacts?: unknown[];
  recentValuationRuns?: unknown[];
  latestValuationRunDetail?: unknown | null;
  referenceDataCatalog?: unknown | null;
};

// DeepSeek-V4-Pro recommends at least a 384K-token context for Think Max.
// HF does not expose a context-window request field, so this is our app-side
// payload gate with practical JSON/UTF-8 headroom for that scale.
const DEFAULT_MAX_AI_PAYLOAD_BYTES = 4_000_000;
const DEFAULT_AI_MAX_TOKENS = 8_192;
const DEFAULT_AI_TEMPERATURE = 1.0;
const DEFAULT_AI_TOP_P = 1.0;
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AI_SCENARIO_PROMPT_VERSION = "2026-05-06-grounded-statements-v4";
const IMPORT_CONTEXT_TOKEN_HEADER = "x-import-context-token";
const MAX_IMPORT_CONTEXT_TOKEN_BYTES = 256;
const aiAnalysisCache = new Map<string, {
  analysis: AnalysisPayload;
  tokenUsage: AiTokenUsage;
  expiresAt: number;
}>();

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
    operatingMargin: { type: "number", minimum: 5, maximum: 50 },
    discountRate: { type: "number", minimum: 5, maximum: 20 },
    terminalGrowth: { type: "number", minimum: 0, maximum: 5 },
    rationale: { type: "string", minLength: 1 },
  },
} as const;

const scenarioAnalysisResponseFormat = {
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

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const assumptionBounds = {
  revenueGrowth: { min: -5, max: 30 },
  operatingMargin: { min: 5, max: 50 },
  discountRate: { min: 5, max: 20 },
  terminalGrowth: { min: 0, max: 5 },
} as const;

const isAssumptionValueInBounds = (
  key: keyof typeof assumptionBounds,
  value: unknown,
): value is number =>
  isNumber(value) &&
  value >= assumptionBounds[key].min &&
  value <= assumptionBounds[key].max;

const isScenarioPayload = (value: unknown): value is ScenarioPayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isAssumptionValueInBounds("revenueGrowth", record.revenueGrowth) &&
    isAssumptionValueInBounds("operatingMargin", record.operatingMargin) &&
    isAssumptionValueInBounds("discountRate", record.discountRate) &&
    isAssumptionValueInBounds("terminalGrowth", record.terminalGrowth) &&
    typeof record.rationale === "string" &&
    record.rationale.trim().length > 0
  );
};

const isOrderedAnalysis = (analysis: AnalysisPayload): boolean =>
  analysis.bull.revenueGrowth >= analysis.base.revenueGrowth &&
  analysis.base.revenueGrowth >= analysis.bear.revenueGrowth &&
  analysis.bull.operatingMargin >= analysis.base.operatingMargin &&
  analysis.base.operatingMargin >= analysis.bear.operatingMargin &&
  analysis.bear.discountRate >= analysis.base.discountRate &&
  analysis.base.discountRate >= analysis.bull.discountRate &&
  analysis.bull.terminalGrowth >= analysis.base.terminalGrowth &&
  analysis.base.terminalGrowth >= analysis.bear.terminalGrowth;

const parseAnalysisPayload = (raw: string): AnalysisPayload | null => {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const parsedRecord = parsed as Record<string, unknown>;
    const wrappedAnalysis = readRecord(parsedRecord.analysis);
    const record = wrappedAnalysis ?? parsedRecord;
    if (
      isScenarioPayload(record.base) &&
      isScenarioPayload(record.bull) &&
      isScenarioPayload(record.bear)
    ) {
      const analysis = {
        base: record.base,
        bull: record.bull,
        bear: record.bear,
      };
      return isOrderedAnalysis(analysis) ? analysis : null;
    }
  } catch {
    return null;
  }
  return null;
};

const UNSUPPORTED_RATIONALE_TOPICS: Array<{ label: string; terms: string[] }> = [
  { label: "product catalysts", terms: ["product cycle", "product launch"] },
  { label: "AI catalysts", terms: ["ai-driven", "ai catalyst", "ai cycle"] },
  { label: "segment mix", terms: ["services mix", "services expansion", "segment mix", "wearables"] },
  { label: "macro conditions", terms: ["macro", "macroeconomic", "inflation", "interest rate"] },
  { label: "regulatory pressure", terms: ["regulatory"] },
  { label: "competitive dynamics", terms: ["competitive"] },
  { label: "beta or ERP", terms: ["beta", "equity risk premium", "erp", "risk-free", "risk free"] },
  { label: "market price", terms: ["market cap", "market capitalization", "share price", "stock price"] },
  { label: "credit rating", terms: ["credit rating"] },
  { label: "GDP", terms: ["gdp"] },
  { label: "cost pressure", terms: ["cost pressure"] },
];

const findUnsupportedRationaleTopics = (
  analysis: AnalysisPayload,
  payload: unknown,
): string[] => {
  const modelPayload = buildModelPayload(payload);
  const modelRecord = readRecord(modelPayload);
  let evidencePayload: unknown = modelPayload;
  if (modelRecord) {
    const withoutPromptNotes = { ...modelRecord };
    delete withoutPromptNotes.dashboardStateNotes;
    delete withoutPromptNotes.instructions;
    evidencePayload = withoutPromptNotes;
  }
  const evidenceText = JSON.stringify(evidencePayload).toLowerCase();
  const rationaleText = (["base", "bull", "bear"] as const)
    .map((scenario) => analysis[scenario].rationale)
    .join(" ")
    .toLowerCase();
  const unsupported = new Set<string>();
  for (const topic of UNSUPPORTED_RATIONALE_TOPICS) {
    const mentioned = topic.terms.some((term) => rationaleText.includes(term));
    const supported = topic.terms.some((term) => evidenceText.includes(term));
    if (mentioned && !supported) {
      unsupported.add(topic.label);
    }
  }
  return [...unsupported];
};

const assumptionKeys = [
  "revenueGrowth",
  "operatingMargin",
  "discountRate",
  "terminalGrowth",
] as const;

const readCurrentAssumptions = (payload: unknown): Record<Scenario, Assumptions> | null => {
  const record = readRecord(payload);
  const currentAssumptions = readRecord(record?.currentAssumptions);
  if (!currentAssumptions) {
    return null;
  }
  const base = readRecord(currentAssumptions.base);
  const bull = readRecord(currentAssumptions.bull);
  const bear = readRecord(currentAssumptions.bear);
  if (!base || !bull || !bear) {
    return null;
  }
  const readAssumptions = (value: Record<string, unknown>): Assumptions | null => {
    const result = {
      revenueGrowth: value.revenueGrowth,
      operatingMargin: value.operatingMargin,
      discountRate: value.discountRate,
      terminalGrowth: value.terminalGrowth,
    };
    return assumptionKeys.every((key) => isNumber(result[key]))
      ? result as Assumptions
      : null;
  };
  const baseAssumptions = readAssumptions(base);
  const bullAssumptions = readAssumptions(bull);
  const bearAssumptions = readAssumptions(bear);
  if (!baseAssumptions || !bullAssumptions || !bearAssumptions) {
    return null;
  }
  return {
    base: baseAssumptions,
    bull: bullAssumptions,
    bear: bearAssumptions,
  };
};

const readActiveScenario = (payload: unknown): Scenario | null => {
  const record = readRecord(payload);
  const value = record?.activeScenario;
  return value === "base" || value === "bull" || value === "bear" ? value : null;
};

const isScenarioUnchanged = (
  analysis: AnalysisPayload,
  currentAssumptions: Record<Scenario, Assumptions> | null,
  scenario: Scenario,
): boolean => {
  if (!currentAssumptions) {
    return false;
  }
  return assumptionKeys.every((key) =>
    Math.abs(analysis[scenario][key] - currentAssumptions[scenario][key]) < 0.001,
  );
};

const isScenarioTooClose = (
  analysis: AnalysisPayload,
  currentAssumptions: Record<Scenario, Assumptions> | null,
  scenario: Scenario,
): boolean => {
  if (!currentAssumptions) {
    return false;
  }
  const current = currentAssumptions[scenario];
  const next = analysis[scenario];
  const materialDriverChanged =
    Math.abs(next.revenueGrowth - current.revenueGrowth) >= 0.5 ||
    Math.abs(next.operatingMargin - current.operatingMargin) >= 0.5 ||
    Math.abs(next.discountRate - current.discountRate) >= 0.25;
  const terminalMeaningfullyChanged = Math.abs(next.terminalGrowth - current.terminalGrowth) >= 0.75;
  return !materialDriverChanged && !terminalMeaningfullyChanged;
};

const isNoOpAnalysis = (
  analysis: AnalysisPayload,
  currentAssumptions: Record<Scenario, Assumptions> | null,
): boolean => {
  if (!currentAssumptions) {
    return false;
  }
  return (["base", "bull", "bear"] as const).every((scenario) =>
    isScenarioUnchanged(analysis, currentAssumptions, scenario),
  );
};

const shouldRetryForUnchangedAssumptions = (
  analysis: AnalysisPayload,
  currentAssumptions: Record<Scenario, Assumptions> | null,
  activeScenario: Scenario | null,
): boolean =>
  isNoOpAnalysis(analysis, currentAssumptions) ||
  Boolean(activeScenario && isScenarioTooClose(analysis, currentAssumptions, activeScenario));

const formatAssumptionSet = (currentAssumptions: Record<Scenario, Assumptions> | null): string =>
  currentAssumptions
    ? (["base", "bull", "bear"] as const)
        .map((scenario) =>
          `${scenario}: ${assumptionKeys.map((key) => `${key}=${currentAssumptions[scenario][key]}`).join(", ")}`,
        )
        .join("; ")
    : "none supplied";

const buildModelPayload = (payload: unknown): unknown => {
  const record = readRecord(payload);
  if (!record) {
    return payload;
  }
  const rest = { ...record };
  delete rest.currentAssumptions;
  return {
    ...rest,
    dashboardStateNotes: [
      "currentAssumptions was intentionally withheld from the model evidence packet.",
      "Assumptions must be inferred from company identity, statements, projections, KPIs, sensitivity, Monte Carlo, provenance, imports, Convex context, and reference data.",
      "Engine projections and scenario fair values may have been generated from the current dashboard assumptions. Use them as sensitivity/output context, not as independent evidence to copy back into assumptions.",
      "Do not describe projection-driven growth from the current engine run as historical CAGR or as an independently observed engine CAGR.",
      "When statementTrends is present, prefer it for historical revenue growth and operating margin. KPI percent values may be decimal rates when <= 1, and engine KPI values are model outputs/assumptions unless explicitly marked as historical.",
      "Do not use engine KPI wacc or ebit_margin as justification for selecting a new discount rate or operating margin.",
      "Do not cite exact beta, equity risk premium, risk-free rate, or market-price facts unless those exact fields are present in the payload or convexContext.",
      "Do not cite product cycles, AI catalysts, segment mix, macro conditions, regulatory pressure, or competitive dynamics unless those exact topics are present in the payload or convexContext.",
      "Do not treat generic dashboard defaults as company fundamentals.",
    ],
  };
};

const AI_SCENARIO_SYSTEM_PROMPT = [
  "You are the valuation co-pilot for a DCF dashboard that uses real company filings, Convex persistence, and a Python DCF engine.",
  "",
  "Your job:",
  "- Produce base, bull, and bear DCF scenario assumptions for the selected company.",
  "- Return exactly one JSON object with keys base, bull, and bear.",
  "- Each scenario object must contain numeric revenueGrowth, operatingMargin, discountRate, terminalGrowth, and a concise rationale string.",
  "- The numeric fields are percentages, not decimals. Example: 7.5 means 7.5%.",
  "",
  "Evidence hierarchy:",
  "1. Prefer explicit live valuation context from the request: company identity, engine outputs, KPIs, statements, projections, sensitivity, Monte Carlo, and provenance.",
  "2. Use convexContext as server-curated database context. It may include companyCache, companyStatementHistory, importedFacts, importArtifacts, recentValuationRuns, latestValuationRunDetail, and referenceDataCatalog.",
  "3. Treat EDGAR/provenance-backed facts and manually approved import facts as stronger evidence than generic prior knowledge.",
  "4. Treat recent valuation run summaries/traces as historical product state, not live market data.",
  "5. If facts conflict, prefer the most recent filing/provenance date and explain the conflict briefly in the rationale.",
  "",
  "Convex context contract:",
  "- companyCache: cached company identity row from Convex companies.",
  "- companyStatementHistory: cached statement facts from Convex companyStatements.",
  "- importedFacts: approved user-reviewed facts persisted in Convex.",
  "- importArtifacts: approved artifact metadata tied to imported facts. Storage ids are references only; you cannot read raw files.",
  "- recentValuationRuns: recent saved valuation run summaries persisted in Convex.",
  "- latestValuationRunDetail: latest saved run with trace included when available.",
  "- referenceDataCatalog: catalog of available reference datasets, not full table rows.",
  "",
  "Scenario construction rules:",
  "- Base should be realistic and anchored to recent fundamentals and engine outputs.",
  "- Bull should be plausibly optimistic, not promotional. It should improve growth and/or margin and usually lower discount rate versus base.",
  "- Bear should be plausibly adverse, not apocalyptic unless the data supports it. It should reduce growth and/or margin and usually raise discount rate versus base.",
  "- Maintain ordering: bull revenueGrowth >= base revenueGrowth >= bear revenueGrowth; bull operatingMargin >= base operatingMargin >= bear operatingMargin; bear discountRate >= base discountRate >= bull discountRate; bull terminalGrowth >= base terminalGrowth >= bear terminalGrowth.",
  "- Terminal growth should stay economically plausible for the company currency/country and mature-company status. Do not exceed long-run nominal growth without a strong data reason.",
  "- Use sensitivity and Monte Carlo context to keep assumptions inside ranges the engine already indicates are important.",
  "- Prefer statementTrends and statementHistory for historical growth and operating margin. Do not cite engine KPI ebit_margin or projected EBIT margin as historical operating margin unless statement facts support it.",
  "- For discount rate rationale, cite only supplied context such as sensitivity, Monte Carlo, currency/country, balance sheet cash/debt, saved run context, or explicit reference data. Do not use engine KPI wacc as evidence for the new WACC, and do not invent beta, ERP, risk-free rates, credit ratings, prices, or market caps.",
  "- Do not cite product launches, AI catalysts, segment mix, macro conditions, regulatory pressure, or competitive dynamics unless supplied context explicitly includes those topics. When only financial statements are supplied, keep rationale anchored to statement trends, profitability, balance sheet, sensitivity, and Monte Carlo.",
  "- Do not cite forecast projections generated from current assumptions as if they were historical realized growth. If you mention them, call them projections or engine outputs.",
  "- Use imported-fact review/provenance quality to temper confidence when data is manually edited, parsed, missing, stale, or uncertain.",
  "- Do not copy generic dashboard defaults. If you see values described as forbidden/current/dashboard values, treat them only as values to avoid echoing, not as evidence.",
  "",
  "Strict output rules:",
  "- Return only JSON. No markdown. No prose outside JSON. No code fences.",
  "- Do not reveal chain-of-thought or private reasoning.",
  "- Do not invent exact facts, filings, metrics, prices, or database rows absent from the supplied context.",
  "- Rationale should cite the provided context at a high level, such as filings, statement trend, sensitivity, Monte Carlo, import review, or prior saved runs.",
  "- Keep rationales useful but compact: one or two sentences per scenario.",
].join("\n");

const buildPrompt = (
  payload: unknown,
  options: {
    forceDistinct?: boolean;
    currentAssumptions?: Record<Scenario, Assumptions> | null;
    activeScenario?: Scenario | null;
    fastFinal?: boolean;
  } = {},
) => [
  "Create DCF scenario assumptions from the following valuation context.",
  options.fastFinal
    ? "Use concise private reasoning and return the final strict JSON object promptly."
    : "Use maximum private reasoning effort, but obey the system prompt and return only the strict JSON object.",
  options.forceDistinct
    ? `Your previous output did not visibly change the active dashboard scenario (${options.activeScenario ?? "unknown"}). Revise it now using the supplied fundamentals, projections, sensitivity, Monte Carlo, and provenance. Make revenue growth, operating margin, or discount rate in the active scenario materially different; a terminal-growth-only tweak is not enough. Do not return this exact set: ${formatAssumptionSet(options.currentAssumptions ?? null)}. These forbidden current dashboard values are not evidence and must not be cited in rationale or described as KPI values, historical facts, filing facts, projections, or engine-derived assumptions.`
    : "Do not echo generic dashboard defaults. Applying your result should reflect your independent view of the valuation context.",
  "The payload may include convexContext. Treat it as a server-curated, allowlisted Convex database bundle.",
  "convexContext.companyCache means the cached company identity row from Convex.",
  "convexContext.companyStatementHistory means cached annual/company statement facts from Convex.",
  "convexContext.importedFacts means approved user-reviewed facts persisted in Convex.",
  "convexContext.importArtifacts means approved source artifact metadata persisted in Convex file storage.",
  "convexContext.recentValuationRuns means recent saved valuation run summaries persisted in Convex, not live market data.",
  "convexContext.latestValuationRunDetail may include the latest saved valuation trace and normalized inputs.",
  "convexContext.referenceDataCatalog summarizes available Damodaran/reference datasets in Convex.",
  JSON.stringify(buildModelPayload(payload)),
].join("\n\n");

const buildCompactPrompt = (
  payload: unknown,
  options: {
    forceDistinct?: boolean;
    currentAssumptions?: Record<Scenario, Assumptions> | null;
    activeScenario?: Scenario | null;
  } = {},
) => [
  "Return only a JSON object with base, bull, and bear DCF assumptions.",
  "Each scenario must include revenueGrowth, operatingMargin, discountRate, terminalGrowth, and rationale.",
  "Use percentages, keep values inside the dashboard bounds, and maintain bull/base/bear ordering.",
  "Answer immediately with the final JSON. Do not spend the response budget on hidden reasoning.",
  options.forceDistinct
    ? `The active scenario (${options.activeScenario ?? "unknown"}) must visibly differ in revenue growth, operating margin, or discount rate from these current dashboard values; a terminal-growth-only tweak is not enough: ${formatAssumptionSet(options.currentAssumptions ?? null)}. These values are forbidden dashboard state only; do not cite them as KPI values, historical facts, filing facts, projections, or engine-derived assumptions.`
    : "Do not echo generic dashboard defaults.",
  "Evidence:",
  JSON.stringify(buildModelPayload(payload)),
].join("\n\n");

const parsePositiveIntegerEnv = (key: string, defaultValue: number): number => {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : defaultValue;
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : defaultValue;
};

const parseNumberEnv = (key: string, defaultValue: number): number => {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : defaultValue;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
};

const getMaxPayloadBytes = (): number =>
  parsePositiveIntegerEnv("HUGGING_FACE_MAX_INPUT_BYTES", DEFAULT_MAX_AI_PAYLOAD_BYTES);

const getMaxOutputTokens = (): number =>
  parsePositiveIntegerEnv("HUGGING_FACE_MAX_OUTPUT_TOKENS", DEFAULT_AI_MAX_TOKENS);

const getTemperature = (): number =>
  Math.min(2, parseNumberEnv("HUGGING_FACE_TEMPERATURE", DEFAULT_AI_TEMPERATURE));

const getTopP = (): number =>
  Math.min(1, parseNumberEnv("HUGGING_FACE_TOP_P", DEFAULT_AI_TOP_P));

const getReasoningEffort = (): string =>
  process.env.HUGGING_FACE_REASONING_EFFORT || "xhigh";

const getResponseFormat = () =>
  process.env.HUGGING_FACE_RESPONSE_FORMAT === "json_schema"
    ? scenarioAnalysisResponseFormat
    : { type: "json_object" as const };

const getProviderTimeoutMs = (): number =>
  parsePositiveIntegerEnv("HUGGING_FACE_PROVIDER_TIMEOUT_MS", 90_000);

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const compactArray = (value: unknown, limit: number): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, limit);
};

const pickFields = (
  value: unknown,
  fields: string[],
): Record<string, unknown> | null => {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (record[field] !== undefined) {
      picked[field] = record[field];
    }
  }
  return picked;
};

const publicRunSummaryFields = [
  "_id",
  "createdAt",
  "status",
  "symbol",
  "resultSummary",
];

const privateRunSummaryFields = [
  "engineVersion",
  "normalizedInputs",
  "provenance",
  "primaryKeyNorm",
  "regionCode",
  "asOfDate",
  "traceStorage",
  "traceByteSize",
];

const compactRunSummary = (
  run: unknown,
  { includePrivateMetadata = false }: { includePrivateMetadata?: boolean } = {},
): Record<string, unknown> | null =>
  pickFields(run, [
    ...publicRunSummaryFields,
    ...(includePrivateMetadata ? privateRunSummaryFields : []),
  ]);

const compactTrace = (detail: unknown): unknown => {
  const detailRecord = readRecord(detail);
  const run = readRecord(detailRecord?.run);
  const traceWrapper = readRecord(detailRecord?.trace);
  const trace = readRecord(run?.trace) ?? readRecord(traceWrapper?.trace);
  if (!detailRecord || !run) {
    return detail;
  }
  return {
    run: compactRunSummary(run, { includePrivateMetadata: true }),
    trace: trace
      ? {
          base: trace.base,
          bull: trace.bull,
          bear: trace.bear,
          sensitivity: trace.sensitivity,
          monteCarlo: trace.monteCarlo
            ? {
                summary: readRecord(trace.monteCarlo)?.summary,
              }
            : undefined,
          kpis: trace.kpis,
        }
      : undefined,
  };
};

const compactReferenceCatalog = (catalog: unknown): unknown => {
  const record = readRecord(catalog);
  if (!record) {
    return catalog;
  }
  const datasets = compactArray(record.datasets, 80);
  return {
    datasets,
    datasetCount: Array.isArray(record.datasets) ? record.datasets.length : datasets.length,
    regions: compactArray(record.regions, 40),
    datasetMappings: compactArray(record.datasetMappings, 80),
  };
};

const extractConvexLookup = (payload: unknown): ConvexLookup => {
  const record = readRecord(payload);
  const company = readRecord(record?.company);
  return {
    listingId: readString(company?.id) ?? readString(record?.listingId) ?? readString(record?.companyId),
    symbol: readString(company?.symbol) ?? readString(record?.symbol),
  };
};

const dataContract = {
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

const browserPrivateConvexContextEnabled = (): boolean =>
  process.env.VALUATION_HISTORY_BROWSER_READS === "1";

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const safeCompare = (provided: string, expected: string): boolean => {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
};

const isImportContextTokenRequest = (request: Request): boolean => {
  const expectedHash = process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256?.trim().toLowerCase();
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  const token = request.headers.get(IMPORT_CONTEXT_TOKEN_HEADER)?.trim();
  if (!token || Buffer.byteLength(token, "utf8") > MAX_IMPORT_CONTEXT_TOKEN_BYTES) {
    return false;
  }
  return safeCompare(sha256Hex(token), expectedHash);
};

const loadConvexAiContext = async (
  payload: unknown,
  { includeImportContext, includePrivateData, includeSavedRunTrace }: {
    includeImportContext: boolean;
    includePrivateData: boolean;
    includeSavedRunTrace: boolean;
  },
): Promise<ConvexAiContext> => {
  const lookup = extractConvexLookup(payload);
  if (!includePrivateData) {
    return {
      available: false,
      reason: "BROWSER_READS_DISABLED",
      lookup,
      dataContract,
    };
  }
  const convexClient = getConvexClient();
  if (!convexClient) {
    return {
      available: false,
      reason: "CONVEX_NOT_CONFIGURED",
      lookup,
      dataContract,
    };
  }

  try {
    const [companyCache, statementHistoryResult, referenceDataCatalog] = await Promise.all([
      lookup.symbol
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
        ? (convexClient as any).query("companies:get" as any, { symbol: lookup.symbol })
        : Promise.resolve(null),
      lookup.symbol
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
        ? (convexClient as any).query("companyStatements:listBySymbol" as any, {
            symbol: lookup.symbol,
            limit: 10,
          })
        : Promise.resolve(null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      (convexClient as any).query("seed:getReference" as any, {}),
    ]);

    let importedFacts: unknown = null;
    if (includeImportContext && lookup.listingId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      importedFacts = await (convexClient as any).query("imports:getImportedFacts" as any, {
        listingId: lookup.listingId,
      });
    }
    if (includeImportContext && !importedFacts && lookup.symbol) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      const matches = await (convexClient as any).query("imports:listBySymbol" as any, {
        symbol: lookup.symbol,
        limit: 1,
      });
      importedFacts = Array.isArray(matches) ? matches[0] ?? null : null;
    }

    const importedRecord = readRecord(importedFacts);
    const resolvedListingId = readString(importedRecord?.listingId) ?? lookup.listingId;
    const artifactIds = Array.isArray(importedRecord?.artifactIds)
      ? new Set(importedRecord.artifactIds)
      : null;
    let importArtifacts: unknown[] = [];
    if (includeImportContext && resolvedListingId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      const artifacts = await (convexClient as any).query("imports:listArtifactsForListing" as any, {
        listingId: resolvedListingId,
        status: "approved",
        limit: 20,
      });
      importArtifacts = Array.isArray(artifacts)
        ? artifacts.filter((artifact) => {
            if (!artifactIds) {
              return true;
            }
            const artifactRecord = readRecord(artifact);
            return artifactIds.has(artifactRecord?.artifactId);
          })
        : [];
    }

    let recentValuationRuns: unknown[] = [];
    let latestValuationRunDetail: unknown = null;
    const syncToken = getSyncTokenOptional();
    if (syncToken && lookup.symbol) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      const runs = await (convexClient as any).query("valuations:listByTicker" as any, {
        syncToken,
        symbol: lookup.symbol,
        limit: 5,
      });
      recentValuationRuns = Array.isArray(runs) ? runs : [];
      const latestSuccessfulRun = recentValuationRuns.find((run) => {
        const runRecord = readRecord(run);
        return readString(runRecord?.status) === "success" && readString(runRecord?._id);
      });
      const latestRunId = readString(readRecord(latestSuccessfulRun)?._id);
      if (includeSavedRunTrace && latestRunId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
        latestValuationRunDetail = await (convexClient as any).query("valuations:get" as any, {
          syncToken,
          runId: latestRunId,
          includeTrace: true,
        });
      }
    }

    return {
      available: true,
      lookup,
      dataContract,
      companyCache: pickFields(companyCache, [
        "symbol",
        "name",
        "cik",
        "country",
        "currency",
        "source",
        "updatedAt",
      ]),
      companyStatementHistory: compactArray(readRecord(statementHistoryResult)?.statements, 10),
      importedFacts,
      importArtifacts: compactArray(importArtifacts, 10),
      recentValuationRuns: recentValuationRuns.flatMap((run) => {
        const compact = compactRunSummary(run, {
          includePrivateMetadata: includeSavedRunTrace,
        });
        return compact ? [compact] : [];
      }),
      latestValuationRunDetail: compactTrace(latestValuationRunDetail),
      referenceDataCatalog: compactReferenceCatalog(referenceDataCatalog),
    };
  } catch (error) {
    console.error("AI Convex context fetch failed", error);
    return {
      available: false,
      reason: "CONVEX_CONTEXT_ERROR",
      lookup,
      dataContract,
    };
  }
};

const withConvexContext = (payload: unknown, convexContext: ConvexAiContext): unknown => {
  const record = readRecord(payload);
  if (!record) {
    return { request: payload, convexContext };
  }
  return {
    ...record,
    convexContext,
  };
};

const getDailyLimit = (): number => {
  const raw = process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY;
  const parsed = raw ? Number(raw) : 25;
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : 25;
};

const readJsonPayload = async (request: Request): Promise<unknown> => {
  return parseJsonWithLimit<unknown>(request, getMaxPayloadBytes());
};

const cacheKeyFor = (model: string, payload: unknown): string =>
  createHash("sha256")
    .update(AI_SCENARIO_PROMPT_VERSION)
    .update("\n")
    .update(model)
    .update("\n")
    .update(JSON.stringify(payload))
    .digest("hex");

const readCachedAnalysis = (key: string): {
  analysis: AnalysisPayload;
  tokenUsage: AiTokenUsage;
} | null => {
  const cached = aiAnalysisCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    aiAnalysisCache.delete(key);
    return null;
  }
  return {
    analysis: cached.analysis,
    tokenUsage: cached.tokenUsage,
  };
};

const writeCachedAnalysis = (
  key: string,
  analysis: AnalysisPayload,
  tokenUsage: AiTokenUsage,
) => {
  aiAnalysisCache.set(key, {
    analysis,
    tokenUsage,
    expiresAt: Date.now() + AI_CACHE_TTL_MS,
  });
};

const extractProviderContent = (data: unknown): string | null =>
  typeof data === "object" &&
  data !== null &&
  Array.isArray((data as { choices?: unknown }).choices)
    ? ((data as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]
        ?.message?.content as string | null)
    : null;

const extractProviderErrorMessage = (data: unknown): string | undefined => {
  const record = readRecord(data);
  const error = readRecord(record?.error);
  return readString(error?.message) ?? readString(record?.message) ?? undefined;
};

const isProviderInputValidationMessage = (message: string | undefined): boolean =>
  typeof message === "string" && message.toLowerCase().includes("input validation");

const summarizeProviderResponse = (data: unknown): Record<string, unknown> | undefined => {
  const record = readRecord(data);
  if (!record) {
    return undefined;
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = readRecord(choices[0]);
  const message = readRecord(firstChoice?.message);
  return {
    object: readString(record.object),
    choiceCount: choices.length,
    finishReason: readString(firstChoice?.finish_reason),
    messageKeys: message ? Object.keys(message).sort() : [],
    contentType: typeof message?.content,
    contentLength: typeof message?.content === "string" ? message.content.length : null,
    reasoningContentLength:
      typeof message?.reasoning_content === "string" ? message.reasoning_content.length : null,
    errorMessage: extractProviderErrorMessage(data),
  };
};

const isProviderTimeoutError = (error: unknown): error is Error => {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || error.message.toLowerCase().includes("aborted due to timeout");
};

const requestAiAnalysis = async ({
  apiKey,
  model,
  payload,
  reasoningEffort,
  forceDistinct = false,
  currentAssumptions = null,
  activeScenario = null,
  compact = false,
  responseFormat = getResponseFormat(),
  maxTokens = getMaxOutputTokens(),
  temperature = getTemperature(),
  timeoutMs = getProviderTimeoutMs(),
}: {
  apiKey: string;
  model: string;
  payload: unknown;
  reasoningEffort: string | null;
  forceDistinct?: boolean;
  currentAssumptions?: Record<Scenario, Assumptions> | null;
  activeScenario?: Scenario | null;
  compact?: boolean;
  responseFormat?: ReturnType<typeof getResponseFormat> | null;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}) => {
  const prompt = compact
    ? buildCompactPrompt(payload, { forceDistinct, currentAssumptions, activeScenario })
    : buildPrompt(payload, {
        forceDistinct,
        currentAssumptions,
        activeScenario,
        fastFinal: reasoningEffort === null,
      });
  const messages: ChatTokenMessage[] = [
    {
      role: "system",
      content: AI_SCENARIO_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: prompt,
    },
  ];
  const estimatedTokenUsage = estimateChatInputTokens(messages, model);
  let response: Response;
  try {
    response = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: getTopP(),
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });
  } catch (error) {
    if (isProviderTimeoutError(error)) {
      return {
        ok: false as const,
        status: 504,
        code: "AI_PROVIDER_TIMEOUT",
        providerMessage: error.message,
      };
    }
    return {
      ok: false as const,
      status: 504,
      code: "AI_PROVIDER_ERROR",
      providerMessage: error instanceof Error ? error.message : "Provider request failed",
    };
  }
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const providerMessage = extractProviderErrorMessage(data);
    if (response.status === 400 && isProviderInputValidationMessage(providerMessage)) {
      return {
        ok: false as const,
        status: response.status,
        code: "AI_PROVIDER_INPUT_VALIDATION",
        providerMessage,
      };
    }
    return {
      ok: false as const,
      status: response.status,
      code: "AI_PROVIDER_ERROR",
      providerMessage,
    };
  }
  const content = extractProviderContent(data);
  if (typeof content !== "string") {
    return {
      ok: false as const,
      status: 502,
      code: "AI_PROVIDER_MALFORMED",
      providerSummary: summarizeProviderResponse(data),
    };
  }
  const analysis = parseAnalysisPayload(content);
  if (!analysis) {
    return {
      ok: false as const,
      status: 502,
      code: "AI_RESPONSE_INVALID",
    };
  }
  const unsupportedTopics = findUnsupportedRationaleTopics(analysis, payload);
  if (unsupportedTopics.length > 0) {
    return {
      ok: false as const,
      status: 502,
      code: "AI_RESPONSE_UNSUPPORTED_RATIONALE",
      unsupportedTopics,
    };
  }
  return {
    ok: true as const,
    analysis,
    tokenUsage: withProviderPromptTokens(estimatedTokenUsage, data),
  };
};

export async function POST(request: Request) {
  const isAdmin = isAdminModeRequest(request);
  if (!isAdmin) {
    const rateLimit = await enforceRateLimit(request, {
      key: "api:ai:scenario-analysis",
      limit: getRateLimitPerMinute("API_RATE_LIMIT_AI_SCENARIO_PER_MINUTE", 3),
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return rateLimitErrorResponse(rateLimit);
    }
  }

  const apiKey = process.env.HUGGING_FACE_API_KEY;
  const model = process.env.HUGGING_FACE_MODEL;
  if (!apiKey || !model) {
    return errorResponse("SERVICE_UNAVAILABLE", "AI analysis is not configured", 503);
  }

  let payload: unknown;
  try {
    payload = await readJsonPayload(request);
  } catch (error) {
    if (error instanceof BodyLimitError) {
      return errorResponse("PAYLOAD_TOO_LARGE", "AI analysis payload is too large", 413);
    }
    return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
  }

  const payloadWithConvexContext = withConvexContext(
    payload,
    await loadConvexAiContext(payload, {
      includeImportContext: isAdmin || isImportContextTokenRequest(request),
      includePrivateData: isAdmin || browserPrivateConvexContextEnabled(),
      includeSavedRunTrace: isAdmin,
    }),
  );
  const currentAssumptions = readCurrentAssumptions(payloadWithConvexContext);
  const activeScenario = readActiveScenario(payloadWithConvexContext);
  const cacheKey = cacheKeyFor(model, payloadWithConvexContext);
  const cachedAnalysis = readCachedAnalysis(cacheKey);
  if (cachedAnalysis) {
    if (!shouldRetryForUnchangedAssumptions(cachedAnalysis.analysis, currentAssumptions, activeScenario)) {
      return NextResponse.json({
        analysis: cachedAnalysis.analysis,
        tokenUsage: cachedAnalysis.tokenUsage,
        cached: true,
        admin: isAdmin,
      });
    }
    aiAnalysisCache.delete(cacheKey);
  }

  if (!isAdmin) {
    const dailyLimit = await enforceGlobalRateLimit({
      key: "api:ai:scenario-analysis:daily",
      limit: getDailyLimit(),
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (!dailyLimit.allowed) {
      return rateLimitErrorResponse(dailyLimit);
    }
  }

  try {
    const first = await requestAiAnalysis({
      apiKey,
      model,
      payload: payloadWithConvexContext,
      reasoningEffort: getReasoningEffort(),
      currentAssumptions,
      activeScenario,
    });

    let result = first;
    if (!result.ok && result.code === "AI_PROVIDER_INPUT_VALIDATION") {
      result = await requestAiAnalysis({
        apiKey,
        model,
        payload: payloadWithConvexContext,
        reasoningEffort: null,
        responseFormat: null,
        currentAssumptions,
        activeScenario,
      });
    }
    if (
      !result.ok &&
      (result.code === "AI_PROVIDER_MALFORMED" ||
        result.code === "AI_RESPONSE_INVALID" ||
        result.code === "AI_RESPONSE_UNSUPPORTED_RATIONALE" ||
        (result.code === "AI_PROVIDER_ERROR" && result.status >= 500))
    ) {
      result = await requestAiAnalysis({
        apiKey,
        model,
        payload: payloadWithConvexContext,
        reasoningEffort: null,
        currentAssumptions,
        activeScenario,
      });
    }
    if (result.ok && shouldRetryForUnchangedAssumptions(result.analysis, currentAssumptions, activeScenario)) {
      result = await requestAiAnalysis({
        apiKey,
        model,
        payload: payloadWithConvexContext,
        reasoningEffort: null,
        forceDistinct: true,
        currentAssumptions,
        activeScenario,
      });
    }

    if (
      !result.ok &&
      (result.code === "AI_PROVIDER_MALFORMED" ||
        result.code === "AI_RESPONSE_INVALID" ||
        result.code === "AI_RESPONSE_UNSUPPORTED_RATIONALE" ||
        (result.code === "AI_PROVIDER_ERROR" && result.status >= 500))
    ) {
      result = await requestAiAnalysis({
        apiKey,
        model,
        payload: payloadWithConvexContext,
        reasoningEffort: null,
        forceDistinct: true,
        currentAssumptions,
        activeScenario,
        compact: true,
        maxTokens: getMaxOutputTokens(),
        temperature: Math.min(0.4, getTemperature()),
      });
    }

    if (
      !result.ok &&
      (result.code === "AI_RESPONSE_INVALID" ||
        result.code === "AI_RESPONSE_UNSUPPORTED_RATIONALE")
    ) {
      return errorResponse("AI_RESPONSE_INVALID", "AI response was not grounded in supplied context", 502);
    }
    if (!result.ok) {
      console.warn("AI provider request failed", {
        status: result.status,
        code: result.code,
        providerMessage: "providerMessage" in result ? result.providerMessage : undefined,
        providerSummary: "providerSummary" in result ? result.providerSummary : undefined,
      });
      return errorResponse("AI_PROVIDER_ERROR", "AI analysis failed", result.status);
    }
    if (shouldRetryForUnchangedAssumptions(result.analysis, currentAssumptions, activeScenario)) {
      return errorResponse(
        "AI_RESPONSE_INVALID",
        "AI response did not materially change the active scenario assumptions",
        502,
      );
    }
    writeCachedAnalysis(cacheKey, result.analysis, result.tokenUsage);
    return NextResponse.json({
      analysis: result.analysis,
      tokenUsage: result.tokenUsage,
      cached: false,
      admin: isAdmin,
    });
  } catch (error) {
    console.error("AI scenario analysis failed", error);
    return errorResponse("AI_PROVIDER_ERROR", "AI analysis failed", 502);
  }
}
