import { NextResponse } from "next/server";

import { isAdminModeRequest } from "@/app/api/_lib/adminMode";
import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import { isAuthorizedBrowserTokenRequest } from "@/app/api/_lib/browserTokenAuth";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  enforceGlobalRateLimit,
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import {
  cacheKeyFor,
  defaultScenarioAnalysisCache,
} from "@/lib/ai/scenarioAnalysis/cache";
import {
  AI_CACHE_TTL_MS,
  DEFAULT_MAX_AI_PAYLOAD_BYTES,
} from "@/lib/ai/scenarioAnalysis/contracts";
import {
  browserPrivateConvexContextEnabled,
  loadConvexAiContext,
  withConvexContext,
} from "@/lib/ai/scenarioAnalysis/convexContext";
import { getMaxOutputTokens, isProviderFailure } from "@/lib/ai/scenarioAnalysis/provider";
import {
  isFinalUnchangedFailure,
  isGroundingFailure,
  runScenarioAnalysisWithRetryPolicy,
} from "@/lib/ai/scenarioAnalysis/retryPolicy";
import {
  readActiveScenario,
  readCurrentAssumptions,
  shouldRetryForUnchangedAssumptions,
} from "@/lib/ai/scenarioAnalysis/validation";

const parsePositiveIntegerEnv = (key: string, defaultValue: number): number => {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : defaultValue;
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : defaultValue;
};

const getMaxPayloadBytes = (): number =>
  parsePositiveIntegerEnv("HUGGING_FACE_MAX_INPUT_BYTES", DEFAULT_MAX_AI_PAYLOAD_BYTES);

const getDailyLimit = (): number => {
  const raw = process.env.API_RATE_LIMIT_AI_SCENARIO_DAILY;
  const parsed = raw ? Number(raw) : 10;
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
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
    payload = await parseJsonWithLimit<unknown>(request, getMaxPayloadBytes());
  } catch (error) {
    if (error instanceof BodyLimitError) {
      return errorResponse("PAYLOAD_TOO_LARGE", "AI analysis payload is too large", 413);
    }
    return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
  }

  const includeImportContext =
    isAdmin || isAuthorizedBrowserTokenRequest(request, "import-context");
  const payloadWithConvexContext = withConvexContext(
    payload,
    await loadConvexAiContext(payload, {
      includeImportContext,
      includePrivateData: isAdmin || browserPrivateConvexContextEnabled(),
      includeSavedRunTrace: isAdmin,
    }),
  );
  const currentAssumptions = readCurrentAssumptions(payloadWithConvexContext);
  const activeScenario = readActiveScenario(payloadWithConvexContext);
  const cacheKey = cacheKeyFor(model, payloadWithConvexContext);
  const cachedAnalysis = defaultScenarioAnalysisCache.get(cacheKey);
  if (cachedAnalysis) {
    if (
      !shouldRetryForUnchangedAssumptions(
        cachedAnalysis.analysis,
        currentAssumptions,
        activeScenario,
      )
    ) {
      return NextResponse.json({
        analysis: cachedAnalysis.analysis,
        tokenUsage: cachedAnalysis.tokenUsage,
        cached: true,
        admin: isAdmin,
      });
    }
    defaultScenarioAnalysisCache.delete(cacheKey);
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
    const retryContext = { currentAssumptions, activeScenario };
    const result = await runScenarioAnalysisWithRetryPolicy(
      {
        apiKey,
        model,
        payload: payloadWithConvexContext,
        reasoningEffort: null,
        currentAssumptions,
        activeScenario,
        maxTokens: getMaxOutputTokens(),
      },
      retryContext,
    );

    if (isGroundingFailure(result)) {
      return errorResponse(
        "AI_RESPONSE_INVALID",
        "AI response was not grounded in supplied context",
        502,
      );
    }
    if (isProviderFailure(result)) {
      console.warn("AI provider request failed", {
        status: result.status,
        code: result.code,
        providerMessage: result.providerMessage,
        providerSummary: result.providerSummary,
      });
      return errorResponse("AI_PROVIDER_ERROR", "AI analysis failed", result.status);
    }
    if (isFinalUnchangedFailure(result, retryContext)) {
      return errorResponse(
        "AI_RESPONSE_INVALID",
        "AI response did not materially change the active scenario assumptions",
        502,
      );
    }

    defaultScenarioAnalysisCache.set(
      cacheKey,
      result.analysis,
      result.tokenUsage,
      AI_CACHE_TTL_MS,
    );
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
