import { NextResponse } from "next/server";

import {
  convexConfigured,
  mutationCompaniesUpsertCompany,
  mutationCompanyStatementsUpsertBatch,
  queryImportsGetImportedFacts,
  queryImportsListBySymbol,
} from "@/app/api/_lib/convexServer";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";

type EdgarStatement = {
  period_end: string;
  period_type: string;
  filing_date?: string | null;
  currency?: string | null;
  revenue?: number | null;
  operating_income?: number | null;
  operating_margin?: number | null;
  cash?: number | null;
  debt?: number | null;
  shares_outstanding?: number | null;
  source?: string | null;
};

type EdgarFacts = {
  symbol: string;
  name?: string | null;
  cik?: string | null;
  currency?: string | null;
  filingCurrency?: string | null;
  source?: string | null;
  updated_at: number;
  statements: EdgarStatement[];
};

const readSymbolFromQuery = (request: Request): string | null => {
  const { searchParams } = new URL(request.url);
  return searchParams.get("symbol")?.trim() ?? null;
};

const readListingIdFromQuery = (request: Request): string | null => {
  const { searchParams } = new URL(request.url);
  return (
    searchParams.get("listingId")?.trim() ??
    searchParams.get("id")?.trim() ??
    null
  );
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

const noStoreJson = (payload: unknown, init?: ResponseInit) =>
  NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...init?.headers,
    },
  });

const shouldReadImportedFacts = (
  listingId: string | null,
  canReadImportedFacts: boolean,
): boolean => Boolean(canReadImportedFacts && listingId);

const normalizeSymbolForComparison = (symbol: string): string =>
  symbol.trim().toUpperCase();

const secListingMicPrefixes = new Set(["XNAS", "XNYS", "ARCX", "XASE"]);

const listingMicPrefix = (listingId: string | null): string | null => {
  const normalized = listingId?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  const [micPrefix] = normalized.split(":", 1);
  return micPrefix && micPrefix !== normalized ? micPrefix : null;
};

const isNonSecListing = (listingId: string | null): boolean => {
  const micPrefix = listingMicPrefix(listingId);
  return Boolean(micPrefix && !secListingMicPrefixes.has(micPrefix));
};

const readImportedFacts = async (
  symbol: string,
  listingId: string | null,
  canReadImportedFacts: boolean,
): Promise<EdgarFacts | null> => {
  if (!convexConfigured()) {
    return null;
  }

  let imported: Record<string, unknown> | null = null;
  if (shouldReadImportedFacts(listingId, canReadImportedFacts)) {
    imported = (await queryImportsGetImportedFacts({
      listingId: listingId!,
    })) as Record<string, unknown> | null;
  }
  if (!imported && !listingId && canReadImportedFacts) {
    const matches = await queryImportsListBySymbol({ symbol, limit: 1 });
    imported = Array.isArray(matches) ? (matches[0] ?? null) : null;
  }
  if (!imported) {
    return null;
  }
  const importedSymbol =
    typeof imported.symbol === "string" ? imported.symbol : null;
  if (
    !importedSymbol ||
    normalizeSymbolForComparison(importedSymbol) !==
      normalizeSymbolForComparison(symbol)
  ) {
    return null;
  }

  const facts = imported.facts;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) {
    return null;
  }
  const importedDoc = imported;
  const record = facts as Record<string, unknown>;
  const statements = Array.isArray(record.statements) ? record.statements : [];
  const filingCurrency =
    typeof record.filingCurrency === "string"
      ? record.filingCurrency
      : typeof record.filing_currency === "string"
        ? record.filing_currency
        : typeof importedDoc.filingCurrency === "string"
          ? importedDoc.filingCurrency
          : null;
  const currency =
    typeof record.currency === "string"
      ? record.currency
      : typeof importedDoc.currency === "string"
        ? importedDoc.currency
        : filingCurrency;
  return {
    symbol: importedSymbol,
    name:
      typeof record.name === "string"
        ? record.name
        : typeof importedDoc.name === "string"
          ? importedDoc.name
          : null,
    cik: null,
    currency,
    filingCurrency,
    source: "import",
    updated_at:
      typeof importedDoc.updatedAt === "number"
        ? importedDoc.updatedAt
        : Date.now(),
    statements: statements
      .flatMap((statement) => {
        if (
          !statement ||
          typeof statement !== "object" ||
          Array.isArray(statement)
        ) {
          return [];
        }
        const item = statement as Record<string, unknown>;
        const periodEnd = item.periodEnd ?? item.period_end;
        if (typeof periodEnd !== "string") {
          return [];
        }
        return [
          {
            period_end: periodEnd,
            period_type:
              typeof item.periodType === "string"
                ? item.periodType
                : typeof item.period_type === "string"
                  ? item.period_type
                  : "FY",
            filing_date:
              typeof item.filingDate === "string"
                ? item.filingDate
                : typeof item.filing_date === "string"
                  ? item.filing_date
                  : null,
            currency:
              typeof item.currency === "string" ? item.currency : currency,
            revenue: typeof item.revenue === "number" ? item.revenue : null,
            operating_income:
              typeof item.operatingIncome === "number"
                ? item.operatingIncome
                : typeof item.operating_income === "number"
                  ? item.operating_income
                  : null,
            operating_margin:
              typeof item.operatingMargin === "number"
                ? item.operatingMargin
                : typeof item.operating_margin === "number"
                  ? item.operating_margin
                  : null,
            cash: typeof item.cash === "number" ? item.cash : null,
            debt: typeof item.debt === "number" ? item.debt : null,
            shares_outstanding:
              typeof item.sharesOutstanding === "number"
                ? item.sharesOutstanding
                : typeof item.shares_outstanding === "number"
                  ? item.shares_outstanding
                  : null,
            source: "import",
          },
        ];
      })
      .sort((a, b) => b.period_end.localeCompare(a.period_end)),
  };
};

const persistFacts = async (facts: EdgarFacts): Promise<void> => {
  if (!convexConfigured()) {
    throw new Error("Persistence backend is not configured");
  }

  await mutationCompaniesUpsertCompany({
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
    operatingIncome: statement.operating_income ?? undefined,
    operatingMargin: statement.operating_margin ?? undefined,
    cash: statement.cash ?? undefined,
    debt: statement.debt ?? undefined,
    sharesOutstanding: statement.shares_outstanding ?? undefined,
    source: statement.source ?? facts.source ?? "edgar",
    updatedAt: facts.updated_at,
  }));

  await mutationCompanyStatementsUpsertBatch({
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
    return rateLimitErrorResponse(rateLimit);
  }

  const symbol = readSymbolFromQuery(request);
  if (!symbol) {
    return errorResponse("BAD_REQUEST", "Missing symbol parameter", 400);
  }

  try {
    const listingId = readListingIdFromQuery(request);
    const canReadImportedFacts = await isInternalPersistenceRequest(request);
    let importedFacts: EdgarFacts | null = null;
    try {
      importedFacts = await readImportedFacts(
        symbol,
        listingId,
        canReadImportedFacts,
      );
    } catch (error) {
      if (isNonSecListing(listingId)) {
        throw error;
      }
      console.warn(
        "Imported facts lookup failed, falling back to EDGAR",
        error,
      );
    }
    if (importedFacts) {
      return noStoreJson(importedFacts);
    }
    if (isNonSecListing(listingId)) {
      return errorResponse(
        "IMPORT_REQUIRED",
        "Approved imported facts are required before valuing this listing.",
        409,
      );
    }
    const facts = await fetchFacts(symbol);
    return noStoreJson(facts);
  } catch (error) {
    console.error("Company facts fetch failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse("EDGAR_ERROR", "EDGAR facts failed", status);
  }
}

export async function POST(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:company:facts:post",
    limit: getRateLimitPerMinute(
      "API_RATE_LIMIT_COMPANY_FACTS_POST_PER_MINUTE",
      30,
    ),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  if (!(await isInternalPersistenceRequest(request))) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
  }

  const symbol =
    readSymbolFromQuery(request) ?? (await readSymbolFromBody(request));
  if (!symbol) {
    return errorResponse("BAD_REQUEST", "Missing symbol parameter", 400);
  }

  let facts: EdgarFacts;
  try {
    facts = await fetchFacts(symbol);
  } catch (error) {
    console.error("Company facts fetch failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse("EDGAR_ERROR", "EDGAR facts failed", status);
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
