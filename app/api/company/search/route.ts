import { NextResponse } from "next/server";

import { getConvexClient } from "@/app/api/_lib/convex";
import { queryCompaniesSearch } from "@/app/api/_lib/convexServer";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { getCompanyLogoUrl } from "@/lib/companyLogos";

type EdgarSearchResponse = {
  results: Array<{
    symbol: string;
    name: string;
    cik: string;
    listing_id?: string | null;
    mic?: string | null;
    exchange?: string | null;
    country_code?: string | null;
    coverage_state?: "valuation_ready" | "import_required" | "detail_only";
    detail_url?: string | null;
  }>;
};

const DCF_ENGINE_SEARCH_TIMEOUT_MS = 5_000;
const DCF_ENGINE_TIMEOUT_STATUS_CODES = new Set([408, 504, 522, 524]);

type OfficialSearchResponse = {
  results: Array<{
    id: string;
    symbol: string;
    name: string;
    exchangeMic?: string | null;
    market?: string | null;
    country?: string | null;
    currency?: string | null;
    coverageState: "valuation_ready" | "import_required" | "detail_only";
    coverageReason?: string | null;
    logoUrl?: string | null;
    sourceLinks?: Array<{ title: string; url: string }>;
  }>;
};

export async function GET(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:company:search",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_COMPANY_SEARCH_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
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
      const results = (await queryCompaniesSearch({
        q,
        limit,
      })) as Array<Record<string, unknown>>;
      if (results.length > 0) {
        return NextResponse.json({
          results: results.map((result: Record<string, unknown>) => {
            const symbol = typeof result.symbol === "string" ? result.symbol : "";
            return withLogoUrl({
              id:
                typeof result._id === "string"
                  ? result._id
                  : symbol
                    ? `XNAS:${symbol}`
                    : "convex:unknown",
              symbol,
              name: typeof result.name === "string" ? result.name : "Unknown company",
              exchangeMic: "XNAS",
              market: typeof result.country === "string" ? result.country : "United States",
              country: typeof result.country === "string" ? result.country : "US",
              currency: typeof result.currency === "string" ? result.currency : "USD",
              coverageState: "valuation_ready",
              coverageReason: "Valuation-ready from the approved company facts cache.",
              sourceLinks: [],
            });
          }),
          source: "convex",
        });
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
    const response = await fetchDcfEngineSearch<OfficialSearchResponse>(
      `/company/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
    return NextResponse.json({
      results: response.results.map(withLogoUrl),
      source: "official",
    });
  } catch (error) {
    if (
      !(error instanceof DcfEngineHttpError) ||
      DCF_ENGINE_TIMEOUT_STATUS_CODES.has(error.status)
    ) {
      console.warn("Official company search failed without fallback", error);
      return errorResponse(
        "SEARCH_UNAVAILABLE",
        "Official company search failed",
        502,
      );
    }
    console.warn("Official company search failed, falling back to SEC search", error);
  }

  try {
    const response = await fetchDcfEngineSearch<EdgarSearchResponse>(
      `/sec/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
    return NextResponse.json({
      results: response.results.map((result) =>
        withLogoUrl({
          id: result.listing_id || (result.mic ? `${result.mic}:${result.symbol}` : `XNAS:${result.symbol}`),
          symbol: result.symbol,
          name: result.name,
          exchangeMic: result.mic ?? "XNAS",
          market: result.exchange ?? "United States",
          country: result.country_code ?? "US",
          currency: "USD",
          coverageState: result.coverage_state ?? "valuation_ready",
          coverageReason:
            result.coverage_state === "import_required"
              ? "Official SEC listing found. Import reviewed statements to unlock valuation."
              : "Valuation-ready through official SEC company facts.",
          sourceLinks: [
            ...(result.detail_url
              ? [{ title: "SEC EDGAR Browse", url: result.detail_url }]
              : []),
            {
              title: "SEC Company Facts",
              url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${result.cik}.json`,
            },
          ],
        }),
      ),
      source: "edgar",
    });
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

type SearchResult = OfficialSearchResponse["results"][number];

function withLogoUrl<T extends SearchResult>(result: T): T {
  return {
    ...result,
    logoUrl: result.logoUrl ?? getCompanyLogoUrl(result.symbol),
  };
}

async function fetchDcfEngineSearch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DCF_ENGINE_SEARCH_TIMEOUT_MS);
  try {
    return await fetchDcfEngine<T>(path, {
      method: "GET",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
