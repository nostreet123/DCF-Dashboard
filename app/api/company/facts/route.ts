import { NextResponse } from "next/server.js";

import { getSyncToken, mutateConvex } from "../../_lib/convex";
import { fetchDcfEngine } from "../../_lib/dcfEngine";
import { errorResponse } from "../../_lib/errors";

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

type UpsertCompanyArgs = {
  syncToken: string;
  symbol: string;
  name?: string;
  cik: string;
  country: string;
  currency: string;
  source: string;
  updatedAt: number;
};

type UpsertStatementArgs = {
  periodEnd: string;
  periodType: string;
  filingDate?: string;
  currency?: string;
  revenue?: number;
  cash?: number;
  debt?: number;
  sharesOutstanding?: number;
  source: string;
  updatedAt: number;
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
    const upsertCompanyArgs: UpsertCompanyArgs = {
      syncToken,
      symbol: facts.symbol,
      name: facts.name ?? undefined,
      cik: facts.cik,
      country: "US",
      currency: facts.currency ?? "USD",
      source: facts.source ?? "edgar",
      updatedAt: facts.updated_at,
    };
    await mutateConvex<unknown>("companies:upsertCompany", upsertCompanyArgs);

    const statements: UpsertStatementArgs[] = (facts.statements ?? []).map((statement) => ({
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

    await mutateConvex<unknown>("companyStatements:upsertBatch", {
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
