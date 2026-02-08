const TOP_LEVEL_ALLOWLIST = new Set([
  "requestId",
  "symbol",
  "primaryKeyNorm",
  "regionCode",
  "asOfDate",
  "periods",
  "revenueT0",
  "cash",
  "debt",
  "otherNonOperatingAssets",
  "sharesOutstanding",
  "reinvestmentLagYears",
  "base",
  "bull",
  "bear",
  "monteCarlo",
]);

const SCENARIO_ALLOWLIST = new Set([
  "revenueGrowth",
  "ebitMargin",
  "taxRate",
  "salesToCapital",
  "wacc",
  "gStable",
  "waccStable",
]);

const EVENT_DATA_ALLOWLIST = new Set([
  "status",
  "code",
  "upstreamStatus",
  "route",
  "traceByteSize",
  "durationMs",
  "engineDurationMs",
  "persistDurationMs",
  "totalDurationMs",
  "eventType",
  "symbol",
  "primaryKeyNorm",
  "regionCode",
  "asOfDate",
  "runId",
  "traceStorage",
  "runs",
  "bins",
  "resultSections",
  "message",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const sanitizeScenario = (value: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const key of SCENARIO_ALLOWLIST) {
    const candidate = value[key];
    if (candidate !== undefined) {
      out[key] = candidate;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

export const sanitizeDebugInputs = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of TOP_LEVEL_ALLOWLIST) {
    const candidate = payload[key];
    if (candidate === undefined) {
      continue;
    }
    if (key === "base" || key === "bull" || key === "bear") {
      const scenario = sanitizeScenario(candidate);
      if (scenario) {
        out[key] = scenario;
      }
      continue;
    }
    if (key === "monteCarlo") {
      if (isRecord(candidate)) {
        const monteCarlo: Record<string, unknown> = {};
        if (typeof candidate.runs === "number") {
          monteCarlo.runs = candidate.runs;
        }
        if (typeof candidate.bins === "number") {
          monteCarlo.bins = candidate.bins;
        }
        if (Object.keys(monteCarlo).length > 0) {
          out.monteCarlo = monteCarlo;
        }
      }
      continue;
    }
    out[key] = candidate;
  }
  return out;
};

export const sanitizeDebugEventData = (
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!data) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const key of EVENT_DATA_ALLOWLIST) {
    const candidate = data[key];
    if (candidate !== undefined) {
      out[key] = candidate;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
};
