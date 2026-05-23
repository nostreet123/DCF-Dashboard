import {
  convexConfigured,
  queryValuationsGet,
} from "@/app/api/_lib/convexServer";
import { errorResponse } from "@/app/api/_lib/errors";
import { browserHistoryReadsEnabled } from "@/app/api/_lib/browserRouteGuards";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import {
  decodeValuationReplayResponse,
  redactBrowserReplay,
} from "@/lib/valuation/decoders";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  if (!browserHistoryReadsEnabled()) {
    return errorResponse("NOT_FOUND", "Not found", 404);
  }

  const rateLimit = await enforceRateLimit(request, {
    key: "api:dcf:history:browser:detail",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_DCF_HISTORY_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  const { runId } = await context.params;
  const trimmedRunId = runId.trim();
  if (!trimmedRunId) {
    return errorResponse("BAD_REQUEST", "Missing runId parameter", 400);
  }

  if (!convexConfigured()) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Valuation history backend is not configured",
      503,
    );
  }

  try {
    const result = await queryValuationsGet({
      runId: trimmedRunId,
      includeTrace: true,
    });

    if (!result) {
      return errorResponse("NOT_FOUND", "Valuation run not found", 404);
    }

    const replay = decodeValuationReplayResponse(result);
    if (!replay) {
      return errorResponse("CONFLICT", "Valuation run has no replayable trace", 409);
    }

    return Response.json({ replay: redactBrowserReplay(replay) });
  } catch (error) {
    console.error("Browser valuation replay fetch failed", error);
    return errorResponse(
      "VALUATION_HISTORY_ERROR",
      "Valuation history fetch failed",
      502,
    );
  }
}
