/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";

import type { ProviderRequestOptions, ProviderResult } from "../lib/ai/scenarioAnalysis/provider";
import {
  applyRetryPatch,
  isTransientProviderFailure,
  runScenarioAnalysisWithRetryPolicy,
  SCENARIO_RETRY_ATTEMPTS,
} from "../lib/ai/scenarioAnalysis/retryPolicy";
import { sampleOrderedAnalysis } from "./helpers/aiScenario";

const baseOptions: ProviderRequestOptions = {
  apiKey: "test-key",
  model: "test/model",
  payload: { company: { symbol: "AAPL" } },
  reasoningEffort: null,
};

const successResult = (): ProviderResult => ({
  ok: true,
  analysis: sampleOrderedAnalysis(),
  tokenUsage: {
    inputTokens: 100,
    estimated: true,
    inputBytes: 0,
    systemTokens: 0,
    userTokens: 0,
    messageCount: 0,
    model: "test/model",
    tokenizer: "local-estimate-v1",
  },
});

describe("AI scenario retry policy", () => {
  test("isTransientProviderFailure matches malformed, invalid, unsupported, and 5xx errors", () => {
    expect(
      isTransientProviderFailure({ ok: false, status: 502, code: "AI_PROVIDER_MALFORMED" }),
    ).toBe(true);
    expect(
      isTransientProviderFailure({ ok: false, status: 502, code: "AI_RESPONSE_INVALID" }),
    ).toBe(true);
    expect(
      isTransientProviderFailure({
        ok: false,
        status: 502,
        code: "AI_RESPONSE_UNSUPPORTED_RATIONALE",
      }),
    ).toBe(true);
    expect(
      isTransientProviderFailure({ ok: false, status: 504, code: "AI_PROVIDER_ERROR" }),
    ).toBe(true);
    expect(
      isTransientProviderFailure({ ok: false, status: 400, code: "AI_PROVIDER_INPUT_VALIDATION" }),
    ).toBe(false);
    expect(
      isTransientProviderFailure({ ok: false, status: 504, code: "AI_PROVIDER_TIMEOUT" }),
    ).toBe(false);
  });

  test("applyRetryPatch merges attempt overrides onto base options", () => {
    const patched = applyRetryPatch(baseOptions, {
      reasoningEffort: null,
      forceDistinct: true,
      compact: true,
      temperature: 0.4,
    });
    expect(patched.forceDistinct).toBe(true);
    expect(patched.compact).toBe(true);
    expect(patched.temperature).toBe(0.4);
    expect(patched.apiKey).toBe("test-key");
  });

  test("runScenarioAnalysisWithRetryPolicy retries input validation failures with simpler request", async () => {
    const calls: Array<Partial<ProviderRequestOptions>> = [];
    const request = async (options: ProviderRequestOptions): Promise<ProviderResult> => {
      calls.push({
        reasoningEffort: options.reasoningEffort,
        responseFormat: options.responseFormat,
      });
      if (calls.length === 1) {
        return {
          ok: false,
          status: 400,
          code: "AI_PROVIDER_INPUT_VALIDATION",
          providerMessage: "Input validation error",
        };
      }
      return successResult();
    };

    const result = await runScenarioAnalysisWithRetryPolicy(
      baseOptions,
      { currentAssumptions: null, activeScenario: null },
      SCENARIO_RETRY_ATTEMPTS,
      request,
    );

    expect(result.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[1].reasoningEffort).toBeNull();
    expect(calls[1].responseFormat).toBeNull();
  });

  test("runScenarioAnalysisWithRetryPolicy escalates to compact fallback after repeated transient failures", async () => {
    const calls: Array<Partial<ProviderRequestOptions>> = [];
    const request = async (options: ProviderRequestOptions): Promise<ProviderResult> => {
      calls.push({
        compact: options.compact,
        forceDistinct: options.forceDistinct,
        reasoningEffort: options.reasoningEffort,
      });
      if (calls.length < 3) {
        return { ok: false, status: 502, code: "AI_RESPONSE_INVALID" };
      }
      return successResult();
    };

    const result = await runScenarioAnalysisWithRetryPolicy(
      baseOptions,
      { currentAssumptions: null, activeScenario: null },
      SCENARIO_RETRY_ATTEMPTS,
      request,
    );

    expect(result.ok).toBe(true);
    expect(calls.length).toBe(3);
    expect(calls[2].compact).toBe(true);
    expect(calls[2].forceDistinct).toBe(true);
    expect(calls[2].reasoningEffort).toBeNull();
  });
});
