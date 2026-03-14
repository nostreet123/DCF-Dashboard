import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { errorResponse } from "@/app/api/_lib/errors";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { normalizeValuationReplay } from "@/lib/valuationHistory";

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

  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Valuation history backend is not configured",
      503,
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    const result = await (convexClient as any).query("valuations:get" as any, {
      syncToken,
      runId: trimmedRunId,
      includeTrace: true,
    });

    if (!result) {
      return errorResponse("NOT_FOUND", "Valuation run not found", 404);
    }

    const replay = normalizeValuationReplay(result);
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
