import type { Assumptions, Scenario } from "@/lib/workbench/scenarioProfiles";

import {
  getMaxOutputTokens,
  getReasoningEffort,
  getTemperature,
  isProviderFailure,
  type ProviderRequestOptions,
  type ProviderResult,
  requestAiAnalysis,
} from "./provider";
import { shouldRetryForUnchangedAssumptions } from "./validation";

export type RetryContext = {
  currentAssumptions: Record<Scenario, Assumptions> | null;
  activeScenario: Scenario | null;
};

export type RetryAttemptPatch = Partial<
  Pick<
    ProviderRequestOptions,
    | "reasoningEffort"
    | "responseFormat"
    | "forceDistinct"
    | "compact"
    | "maxTokens"
    | "temperature"
  >
>;

export type RetryAttemptSpec = {
  id: string;
  patch: () => RetryAttemptPatch;
  shouldRun: (result: ProviderResult, context: RetryContext, attemptIndex: number) => boolean;
};

export const isTransientProviderFailure = (result: ProviderResult): boolean =>
  isProviderFailure(result) &&
  (result.code === "AI_PROVIDER_MALFORMED" ||
    result.code === "AI_RESPONSE_INVALID" ||
    result.code === "AI_RESPONSE_UNSUPPORTED_RATIONALE" ||
    (result.code === "AI_PROVIDER_ERROR" && result.status >= 500));

export const SCENARIO_RETRY_ATTEMPTS: RetryAttemptSpec[] = [
  {
    id: "initial",
    patch: () => ({ reasoningEffort: getReasoningEffort() }),
    shouldRun: (_result, _context, attemptIndex) => attemptIndex === 0,
  },
  {
    id: "input-validation-fallback",
    patch: () => ({ reasoningEffort: null, responseFormat: null }),
    shouldRun: (result) => isProviderFailure(result) && result.code === "AI_PROVIDER_INPUT_VALIDATION",
  },
  {
    id: "transient-failure-retry",
    patch: () => ({ reasoningEffort: null }),
    shouldRun: (result) => isTransientProviderFailure(result),
  },
  {
    id: "unchanged-assumptions-retry",
    patch: () => ({ reasoningEffort: null, forceDistinct: true }),
    shouldRun: (result, context) =>
      result.ok &&
      shouldRetryForUnchangedAssumptions(
        result.analysis,
        context.currentAssumptions,
        context.activeScenario,
      ),
  },
  {
    id: "compact-transient-fallback",
    patch: () => ({
      reasoningEffort: null,
      forceDistinct: true,
      compact: true,
      maxTokens: getMaxOutputTokens(),
      temperature: Math.min(0.4, getTemperature()),
    }),
    shouldRun: (result) => isTransientProviderFailure(result),
  },
];

export const applyRetryPatch = (
  base: ProviderRequestOptions,
  patch: RetryAttemptPatch,
): ProviderRequestOptions => ({
  ...base,
  ...patch,
});

export const runScenarioAnalysisWithRetryPolicy = async (
  baseOptions: ProviderRequestOptions,
  context: RetryContext,
  attempts: RetryAttemptSpec[] = SCENARIO_RETRY_ATTEMPTS,
  request: (options: ProviderRequestOptions) => Promise<ProviderResult> = requestAiAnalysis,
): Promise<ProviderResult> => {
  let result = await request(applyRetryPatch(baseOptions, attempts[0].patch()));

  for (const attempt of attempts.slice(1)) {
    if (!attempt.shouldRun(result, context, 0)) {
      continue;
    }
    result = await request(applyRetryPatch(baseOptions, attempt.patch()));
  }

  return result;
};

export const isGroundingFailure = (result: ProviderResult): boolean =>
  isProviderFailure(result) &&
  (result.code === "AI_RESPONSE_INVALID" || result.code === "AI_RESPONSE_UNSUPPORTED_RATIONALE");

export const isFinalUnchangedFailure = (
  result: ProviderResult,
  context: RetryContext,
): boolean =>
  result.ok &&
  shouldRetryForUnchangedAssumptions(
    result.analysis,
    context.currentAssumptions,
    context.activeScenario,
  );
