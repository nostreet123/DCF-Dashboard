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

const FAIR_VALUE_KEYS = [
  "fairValuePerShare",
  "fair_value_per_share",
  "fairValue",
] as const;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const sanitizeScenarioSummary = (value: unknown): Record<string, number> | undefined => {
  const scenario = asRecord(value);
  if (!scenario) {
    return undefined;
  }

  return FAIR_VALUE_KEYS.reduce<Record<string, number>>((summary, key) => {
    const candidate = scenario[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      summary[key] = candidate;
    }
    return summary;
  }, {});
};

const sanitizeResultSummary = (value: unknown): Record<string, Record<string, number>> | undefined => {
  const resultSummary = asRecord(value);
  if (!resultSummary) {
    return undefined;
  }

  return ["base", "bull", "bear"].reduce<Record<string, Record<string, number>>>(
    (summary, scenarioName) => {
      const scenario = sanitizeScenarioSummary(resultSummary[scenarioName]);
      if (scenario && Object.keys(scenario).length > 0) {
        summary[scenarioName] = scenario;
      }
      return summary;
    },
    {},
  );
};

const sanitizeBrowserHistoryRuns = (runs: unknown): unknown[] => {
  if (!Array.isArray(runs)) {
    return [];
  }
  return runs.flatMap((run) => {
    const record = asRecord(run);
    if (!record) {
      return [];
    }
    return [{
      _id: record._id,
      createdAt: record.createdAt,
      status: record.status,
      symbol: record.symbol,
      resultSummary: sanitizeResultSummary(record.resultSummary),
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
