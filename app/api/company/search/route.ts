import { NextResponse } from "next/server";

import { convexClient } from "@/app/api/_lib/convex";
import { fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { api } from "@/convex/_generated/api";

type EdgarSearchResponse = {
  results: Array<{ symbol: string; name: string; cik: string }>;
};

export async function GET(request: Request) {
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

  try {
    const results = await convexClient.query(api.companies.search, {
      q,
      limit,
    });
    if (results.length > 0) {
      return NextResponse.json({ results, source: "convex" });
    }
  } catch (error) {
    return errorResponse(
      "CONVEX_ERROR",
      error instanceof Error ? error.message : "Convex query failed",
      500,
    );
  }

  if (!process.env.DCF_ENGINE_URL) {
    return NextResponse.json({ results: [], source: "convex" });
  }

  try {
    const response = await fetchDcfEngine<EdgarSearchResponse>(
      `/sec/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { method: "GET" },
    );
    return NextResponse.json({ results: response.results, source: "edgar" });
  } catch (error) {
    return errorResponse(
      "EDGAR_ERROR",
      error instanceof Error ? error.message : "EDGAR search failed",
      502,
    );
  }
}
