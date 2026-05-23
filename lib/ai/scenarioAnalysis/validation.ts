import type { Assumptions, Scenario } from "@/lib/workbench/scenarioProfiles";

import type { AnalysisPayload, ScenarioPayload } from "./contracts";
import { assumptionKeys, readRecord } from "./contracts";
import { buildModelPayload } from "./prompts";

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const assumptionBounds = {
  revenueGrowth: { min: -5, max: 30 },
  operatingMargin: { min: 5, max: 60 },
  discountRate: { min: 5, max: 20 },
  terminalGrowth: { min: 0, max: 5 },
} as const;

export const isAssumptionValueInBounds = (
  key: keyof typeof assumptionBounds,
  value: unknown,
): value is number =>
  isNumber(value) &&
  value >= assumptionBounds[key].min &&
  value <= assumptionBounds[key].max;

export const isScenarioPayload = (value: unknown): value is ScenarioPayload => {
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

export const parseAnalysisPayload = (raw: string): AnalysisPayload | null => {
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

export const UNSUPPORTED_RATIONALE_TOPICS: Array<{ label: string; terms: string[] }> = [
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

export const findUnsupportedRationaleTopics = (
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

export const readCurrentAssumptions = (payload: unknown): Record<Scenario, Assumptions> | null => {
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
      ? (result as Assumptions)
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

export const readActiveScenario = (payload: unknown): Scenario | null => {
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

export const shouldRetryForUnchangedAssumptions = (
  analysis: AnalysisPayload,
  currentAssumptions: Record<Scenario, Assumptions> | null,
  activeScenario: Scenario | null,
): boolean =>
  isNoOpAnalysis(analysis, currentAssumptions) ||
  Boolean(activeScenario && isScenarioTooClose(analysis, currentAssumptions, activeScenario));
