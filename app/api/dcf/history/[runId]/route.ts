import {
  convexConfigured,
  queryValuationsGet,
} from "@/app/api/_lib/convexServer";
import { errorResponse } from "@/app/api/_lib/errors";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { decodeValuationReplayResponse } from "@/lib/valuation/decoders";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:dcf:history:detail",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_DCF_HISTORY_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  if (!(await isInternalPersistenceRequest(request))) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
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

    return Response.json({ replay });
  } catch (error) {
    console.error("Valuation replay fetch failed", error);
    return errorResponse(
      "VALUATION_HISTORY_ERROR",
      "Valuation history fetch failed",
      502,
    );
  }
}
