import { NextResponse } from "next/server";

import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { errorResponse } from "@/app/api/_lib/errors";
import { enforceRateLimit, getRateLimitPerMinute } from "@/app/api/_lib/rateLimit";

const MAX_LIMIT = 50;

const parseLimit = (value: string | null): number | null => {
  if (!value) {
    return 10;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, MAX_LIMIT);
};

export async function GET(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:dcf:history",
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

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim() ?? "";
  const primaryKeyNorm = searchParams.get("primaryKeyNorm")?.trim() ?? "";
  const regionCode = searchParams.get("regionCode")?.trim() ?? undefined;
  const limit = parseLimit(searchParams.get("limit"));

  if (limit === null) {
    return errorResponse("BAD_REQUEST", "Invalid limit parameter", 400);
  }

  if (Boolean(symbol) === Boolean(primaryKeyNorm)) {
    return errorResponse(
      "BAD_REQUEST",
      "Specify exactly one of symbol or primaryKeyNorm",
      400,
    );
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
    if (symbol) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      const runs = await (convexClient as any).query("valuations:listByTicker" as any, {
        syncToken,
        symbol,
        limit,
      });
      return NextResponse.json({ runs });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    const runs = await (convexClient as any).query("valuations:listBySymbol" as any, {
      syncToken,
      primaryKeyNorm,
      regionCode,
      limit,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Valuation history fetch failed", error);
    return errorResponse(
      "VALUATION_HISTORY_ERROR",
      "Valuation history fetch failed",
      502,
    );
  }
}
