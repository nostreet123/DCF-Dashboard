import { NextResponse } from "next/server";

import { getConvexClient } from "@/app/api/_lib/convex";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { enforceRateLimit, getRateLimitPerMinute } from "@/app/api/_lib/rateLimit";

type EdgarSearchResponse = {
  results: Array<{ symbol: string; name: string; cik: string }>;
};

export async function GET(request: Request) {
  const rateLimit = enforceRateLimit(request, {
    key: "api:company:search",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_COMPANY_SEARCH_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return errorResponse("RATE_LIMITED", "Too many requests", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
    });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return errorResponse("BAD_REQUEST", "Missing q parameter", 400);
  }
  const limitParam = searchParams.get("limit");
  let limit = 20;
  if (limitParam) {
    const parsed = Number(limitParam);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      return errorResponse("BAD_REQUEST", "Invalid limit parameter", 400);
    }
    limit = Math.min(parsed, 50);
  }

  const convexClient = getConvexClient();
  if (convexClient) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      const searchCompanies = "companies:search" as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      const results = await (convexClient as any).query(searchCompanies, {
        q,
        limit,
      });
      if (results.length > 0) {
        return NextResponse.json({ results, source: "convex" });
      }
    } catch (error) {
      console.warn("Convex search failed, falling back to EDGAR", error);
    }
  }

  if (!process.env.DCF_ENGINE_URL) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Search backend is not configured",
      503,
    );
  }

  try {
    const response = await fetchDcfEngine<EdgarSearchResponse>(
      `/sec/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { method: "GET" },
    );
    return NextResponse.json({ results: response.results, source: "edgar" });
  } catch (error) {
    console.error("Company search failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse(
      "EDGAR_ERROR",
      "EDGAR search failed",
      status,
    );
  }
}
