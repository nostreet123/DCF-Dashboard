import { NextResponse } from "next/server";

import { getConvexClient } from "@/app/api/_lib/convex";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";

type EdgarSearchResponse = {
  results: Array<{ symbol: string; name: string; cik: string }>;
};

export async function GET(request: Request) {
  // TODO: Add rate limiting (infrastructure-level preferred) for this public endpoint.
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
      error instanceof Error ? error.message : "EDGAR search failed",
      status,
    );
  }
}
