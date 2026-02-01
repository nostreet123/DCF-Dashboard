import { NextResponse } from "next/server";

import { convexClient, getSyncToken } from "@/app/api/_lib/convex";
import { fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim();
  if (!symbol) {
    return errorResponse("BAD_REQUEST", "Missing symbol parameter", 400);
  }

  let facts: EdgarFacts;
  try {
    facts = await fetchDcfEngine<EdgarFacts>(
      `/sec/facts?symbol=${encodeURIComponent(symbol)}`,
      { method: "GET" },
    );
  } catch (error) {
    return errorResponse(
      "EDGAR_ERROR",
      error instanceof Error ? error.message : "EDGAR facts failed",
      502,
    );
  }

  try {
    const syncToken = getSyncToken();
    const upsertCompany = "companies:upsertCompany" as any;
    const upsertBatch = "companyStatements:upsertBatch" as any;
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

    await (convexClient as any).mutation(upsertBatch, {
      syncToken,
      symbol: facts.symbol,
      statements,
    });
  } catch (error) {
    return errorResponse(
      "CONVEX_ERROR",
      error instanceof Error ? error.message : "Convex mutation failed",
      500,
    );
  }

  return NextResponse.json(facts);
}
