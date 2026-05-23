export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";

import {
  convexConfigured,
  queryValuationsListBySymbol,
  queryValuationsListByTicker,
} from "@/app/api/_lib/convexServer";
import { errorResponse } from "@/app/api/_lib/errors";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";

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
    return rateLimitErrorResponse(rateLimit);
  }

  if (!(await isInternalPersistenceRequest(request))) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
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

  if (!convexConfigured()) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Valuation history backend is not configured",
      503,
    );
  }

  try {
    if (symbol) {
      const runs = await queryValuationsListByTicker({ symbol, limit });
      return NextResponse.json({ runs });
    }

    const runs = await queryValuationsListBySymbol({
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
