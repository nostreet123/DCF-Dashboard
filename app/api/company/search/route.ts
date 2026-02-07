import { NextResponse } from "next/server";

import { queryConvex } from "@/app/api/_lib/convex";
import { fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { executeCompanySearch } from "@/app/api/company/search/logic";

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

  const outcome = await executeCompanySearch({
    q,
    limit,
    hasEdgar: Boolean(process.env.DCF_ENGINE_URL),
    searchConvex: async (query, queryLimit) => {
      return queryConvex<Array<{ symbol: string; name: string; cik: string }>>(
        "companies:search",
        {
        q: query,
        limit: queryLimit,
        },
      );
    },
    searchEdgar: async (query, queryLimit) => {
      const response = await fetchDcfEngine<EdgarSearchResponse>(
        `/sec/search?q=${encodeURIComponent(query)}&limit=${queryLimit}`,
        { method: "GET" },
      );
      return response.results;
    },
  });

  if (outcome.ok) {
    return NextResponse.json(outcome.data);
  }

  return errorResponse(outcome.error.code, outcome.error.message, outcome.error.status);
}
