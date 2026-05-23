import {
  normalizeValuationReplay,
  readFairValue,
  type ValuationReplaySnapshot,
} from "@/lib/valuationHistory";

export { normalizeValuationReplay, readFairValue };
export type { ValuationReplaySnapshot };

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const FAIR_VALUE_KEYS = [
  "fairValuePerShare",
  "fair_value_per_share",
  "fairValue",
] as const;

const sanitizeScenarioSummary = (value: unknown): Record<string, number> | undefined => {
  const scenario = asRecord(value);
  if (!scenario) {
    return undefined;
  }

  return FAIR_VALUE_KEYS.reduce<Record<string, number>>((summary, key) => {
    const candidate = scenario[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      summary[key] = candidate;
    }
    return summary;
  }, {});
};

const sanitizeResultSummary = (
  value: unknown,
): Record<string, Record<string, number>> | undefined => {
  const resultSummary = asRecord(value);
  if (!resultSummary) {
    return undefined;
  }

  return ["base", "bull", "bear"].reduce<Record<string, Record<string, number>>>(
    (summary, scenarioName) => {
      const scenario = sanitizeScenarioSummary(resultSummary[scenarioName]);
      if (scenario && Object.keys(scenario).length > 0) {
        summary[scenarioName] = scenario;
      }
      return summary;
    },
    {},
  );
};

export const sanitizeBrowserHistoryRuns = (runs: unknown): unknown[] => {
  if (!Array.isArray(runs)) {
    return [];
  }
  return runs.flatMap((run) => {
    const record = asRecord(run);
    if (!record) {
      return [];
    }
    return [{
      _id: record._id,
      createdAt: record.createdAt,
      status: record.status,
      symbol: record.symbol,
      resultSummary: sanitizeResultSummary(record.resultSummary),
    }];
  });
};

export const redactBrowserReplay = (replay: ValuationReplaySnapshot) => {
  const {
    runId,
    ticker,
    createdAt,
    scenario,
    scenarios,
    range,
    histogram,
  } = replay;
  return {
    runId,
    ticker,
    createdAt,
    scenario,
    scenarios,
    range,
    histogram,
    projections: [],
    kpis: [],
    statementHistory: [],
  };
};

export const decodeValuationReplayResponse = (
  result: unknown,
): ValuationReplaySnapshot | null => normalizeValuationReplay(result);
