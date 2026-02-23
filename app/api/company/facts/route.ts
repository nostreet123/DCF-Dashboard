import { NextResponse } from "next/server";

import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { enforceRateLimit, getRateLimitPerMinute } from "@/app/api/_lib/rateLimit";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";

type EdgarStatement = {
  period_end: string;
  period_type: string;
  filing_date?: string | null;
  currency?: string | null;
  revenue?: number | null;
  cash?: number | null;
  debt?: number | null;
  shares_outstanding?: number | null;
  source?: string | null;
};

type EdgarFacts = {
  symbol: string;
  name?: string | null;
  cik: string;
  currency?: string | null;
  source?: string | null;
  updated_at: number;
  statements: EdgarStatement[];
};

const readSymbolFromQuery = (request: Request): string | null => {
  const { searchParams } = new URL(request.url);
  return searchParams.get("symbol")?.trim() ?? null;
};

const readSymbolFromBody = async (request: Request): Promise<string | null> => {
  try {
    const payload = (await request.json()) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    const symbol = (payload as Record<string, unknown>).symbol;
    if (typeof symbol !== "string") {
      return null;
    }
    const trimmed = symbol.trim();
    return trimmed || null;
  } catch {
    return null;
  }
};

const fetchFacts = async (symbol: string): Promise<EdgarFacts> => {
  return fetchDcfEngine<EdgarFacts>(
    `/sec/facts?symbol=${encodeURIComponent(symbol)}`,
    { method: "GET" },
  );
};

const persistFacts = async (facts: EdgarFacts): Promise<void> => {
  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
    throw new Error("Persistence backend is not configured");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
  const upsertCompany = "companies:upsertCompany" as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
  const upsertBatch = "companyStatements:upsertBatch" as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
  await (convexClient as any).mutation(upsertCompany, {
    syncToken,
    symbol: facts.symbol,
    name: facts.name ?? undefined,
    cik: facts.cik,
    country: "US",
    currency: facts.currency ?? "USD",
    source: facts.source ?? "edgar",
    updatedAt: facts.updated_at,
  });

  const statements = (facts.statements ?? []).map((statement) => ({
    periodEnd: statement.period_end,
    periodType: statement.period_type || "FY",
    filingDate: statement.filing_date ?? undefined,
    currency: statement.currency ?? facts.currency ?? "USD",
    revenue: statement.revenue ?? undefined,
    cash: statement.cash ?? undefined,
    debt: statement.debt ?? undefined,
    sharesOutstanding: statement.shares_outstanding ?? undefined,
    source: statement.source ?? facts.source ?? "edgar",
    updatedAt: facts.updated_at,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
  await (convexClient as any).mutation(upsertBatch, {
    syncToken,
    symbol: facts.symbol,
    statements,
  });
};

export async function GET(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:company:facts:get",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_COMPANY_FACTS_PER_MINUTE", 60),
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

  const symbol = readSymbolFromQuery(request);
  if (!symbol) {
    return errorResponse("BAD_REQUEST", "Missing symbol parameter", 400);
  }

  try {
    const facts = await fetchFacts(symbol);
    return NextResponse.json(facts);
  } catch (error) {
    console.error("Company facts fetch failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse(
      "EDGAR_ERROR",
      "EDGAR facts failed",
      status,
    );
  }
}

export async function POST(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:company:facts:post",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_COMPANY_FACTS_POST_PER_MINUTE", 30),
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

  if (!(await isInternalPersistenceRequest(request))) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
  }

  const symbol = readSymbolFromQuery(request) ?? (await readSymbolFromBody(request));
  if (!symbol) {
    return errorResponse("BAD_REQUEST", "Missing symbol parameter", 400);
  }

  let facts: EdgarFacts;
  try {
    facts = await fetchFacts(symbol);
  } catch (error) {
    console.error("Company facts fetch failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse(
      "EDGAR_ERROR",
      "EDGAR facts failed",
      status,
    );
  }

  try {
    await persistFacts(facts);
  } catch (error) {
    console.warn("Company facts persistence failed", error);
    return errorResponse(
      "PERSISTENCE_ERROR",
      "Company facts persistence failed",
      502,
    );
  }

  return NextResponse.json(facts);
}
