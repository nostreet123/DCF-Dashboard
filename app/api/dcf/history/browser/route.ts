import { NextResponse } from "next/server";

import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { errorResponse } from "@/app/api/_lib/errors";
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

const browserHistoryReadsEnabled = (): boolean =>
  process.env.VALUATION_HISTORY_BROWSER_READS === "1";

const sanitizeBrowserHistoryRuns = (runs: unknown): unknown[] => {
  if (!Array.isArray(runs)) {
    return [];
  }
  return runs.flatMap((run) => {
    if (!run || typeof run !== "object" || Array.isArray(run)) {
      return [];
    }
    const record = run as Record<string, unknown>;
    return [{
      _id: record._id,
      createdAt: record.createdAt,
      status: record.status,
      symbol: record.symbol,
      resultSummary: record.resultSummary,
    }];
  });
};

export async function GET(request: Request) {
  if (!browserHistoryReadsEnabled()) {
    return errorResponse("NOT_FOUND", "Not found", 404);
  }

  const rateLimit = await enforceRateLimit(request, {
    key: "api:dcf:history:browser",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_DCF_HISTORY_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
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
      return NextResponse.json({ runs: sanitizeBrowserHistoryRuns(runs) });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    const runs = await (convexClient as any).query("valuations:listBySymbol" as any, {
      syncToken,
      primaryKeyNorm,
      regionCode,
      limit,
    });
    return NextResponse.json({ runs: sanitizeBrowserHistoryRuns(runs) });
  } catch (error) {
    console.error("Browser valuation history fetch failed", error);
    return errorResponse(
      "VALUATION_HISTORY_ERROR",
      "Valuation history fetch failed",
      502,
    );
  }
}
