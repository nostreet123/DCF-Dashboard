import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { errorResponse } from "@/app/api/_lib/errors";
import { enforceRateLimit, getRateLimitPerMinute } from "@/app/api/_lib/rateLimit";
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
    if (rateLimit.reason === "UNTRUSTED_IDENTITY") {
      return errorResponse("UNTRUSTED_IDENTITY", "Trusted client IP header required", 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
      });
    }
    if (rateLimit.reason === "BACKEND_UNAVAILABLE") {
      return errorResponse("RATE_LIMIT_UNAVAILABLE", "Rate-limit backend unavailable", 503);
    }
    return errorResponse("RATE_LIMITED", "Too many requests", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
    });
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
