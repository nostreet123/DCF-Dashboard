import { NextResponse } from "next/server";

import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import type {
  CompanySearchResult,
  ImportedArtifactMetadata,
  ImportReview,
  ParsedFieldName,
} from "@/lib/contracts/company";
import { buildWorkbenchPayloadFromFacts } from "@/lib/workbench/factsPayload";
import {
  cloneScenarioAssumptions,
  type Assumptions,
  type Scenario,
} from "@/lib/workbench/scenarioProfiles";

type ApprovePayload = {
  company?: CompanySearchResult;
  review?: ImportReview;
  artifacts?: ImportedArtifactMetadata[];
  assumptions?: Record<Scenario, Assumptions>;
};

const REQUIRED_FIELDS: ParsedFieldName[] = [
  "periodEnd",
  "filingCurrency",
  "revenue",
  "cash",
  "debt",
  "sharesOutstanding",
];

const normalizeNumericToken = (raw: string): string => {
  let numeric = raw.replace(/[^0-9.,-]/g, "");
  if (!numeric) {
    return numeric;
  }
  const commaCount = (numeric.match(/,/g) ?? []).length;
  const dotCount = (numeric.match(/\./g) ?? []).length;
  if (commaCount > 0 && dotCount === 0) {
    numeric =
      commaCount === 1 && /^-?\d{1,3},\d{3}$/.test(numeric)
        ? numeric.replace(",", "")
        : commaCount === 1
          ? numeric.replace(",", ".")
          : numeric.replace(/,/g, "");
  } else if (commaCount > 0 && dotCount > 0) {
    const lastComma = numeric.lastIndexOf(",");
    const lastDot = numeric.lastIndexOf(".");
    numeric = lastComma > lastDot
      ? numeric.replace(/\./g, "").replace(",", ".")
      : numeric.replace(/,/g, "");
  }
  return numeric;
};

const readNumber = (raw: string | undefined): number | null => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  const multiplier = /\b(billion|bn)\b|\d\s*bn\b/.test(normalized)
    ? 1_000_000_000
    : /\b(million|mn|mm)\b|\d\s*m\b/.test(normalized)
      ? 1_000_000
      : /\b(thousand|k)\b|\d\s*k\b/.test(normalized)
        ? 1_000
        : 1;
  const value = Number(normalizeNumericToken(normalized));
  return Number.isFinite(value) ? value * multiplier : null;
};

const fieldEntry = (review: ImportReview, field: ParsedFieldName) =>
  review.fields.find((item) => item.field === field);

const fieldValue = (review: ImportReview, field: ParsedFieldName): string | undefined =>
  fieldEntry(review, field)?.value?.trim();

const normalizePeriodEnd = (raw: string | undefined): string | null => {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  let match = value.match(/^(20\d{2}|19\d{2})[-/.](1[0-2]|0?[1-9])[-/.](3[01]|[12]\d|0?[1-9])$/);
  if (match) {
    const [, year, month, day] = match;
    return `${Number(year).toString().padStart(4, "0")}-${Number(month).toString().padStart(2, "0")}-${Number(day).toString().padStart(2, "0")}`;
  }
  match = value.match(/^(3[01]|[12]\d|0?[1-9])[-/.](1[0-2]|0?[1-9])[-/.](20\d{2}|19\d{2})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${Number(year).toString().padStart(4, "0")}-${Number(month).toString().padStart(2, "0")}-${Number(day).toString().padStart(2, "0")}`;
  }
  match = value.match(/^(20\d{2}|19\d{2})$/);
  if (match) {
    return `${match[1]}-12-31`;
  }
  return null;
};

const validateReview = (review: ImportReview): string | null => {
  const missing = REQUIRED_FIELDS.filter((field) => !fieldValue(review, field));
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  const unconfirmed = REQUIRED_FIELDS.filter((field) => fieldEntry(review, field)?.confirmed !== true);
  if (unconfirmed.length > 0) {
    return `Unconfirmed required fields: ${unconfirmed.join(", ")}`;
  }
  if (!normalizePeriodEnd(fieldValue(review, "periodEnd"))) {
    return "Invalid periodEnd value";
  }
  for (const field of ["revenue", "cash", "debt", "sharesOutstanding"] as ParsedFieldName[]) {
    const value = readNumber(fieldValue(review, field));
    if (value === null || (field !== "cash" && field !== "debt" && value <= 0) || value < 0) {
      return `Invalid ${field} value`;
    }
  }
  return null;
};

const buildImportedFacts = (
  company: CompanySearchResult,
  review: ImportReview,
  artifacts: ImportedArtifactMetadata[],
) => {
  const periodEnd = normalizePeriodEnd(fieldValue(review, "periodEnd")) ?? "1970-12-31";
  const currency = fieldValue(review, "filingCurrency") ?? company.currency ?? "USD";
  const sourceLinks = [
    ...(company.sourceLinks ?? []),
    ...artifacts.map((artifact) => ({
      title: `${artifact.parserName} import - ${artifact.originalFilename}`,
      url: artifact.storageId ? `convex-storage:${artifact.storageId}` : `import:${artifact.id}`,
    })),
  ];
  const statement = {
    periodEnd,
    periodType: "FY" as const,
    filingDate: fieldValue(review, "filingDate") ?? null,
    currency,
    revenue: readNumber(fieldValue(review, "revenue")) ?? 0,
    cash: readNumber(fieldValue(review, "cash")) ?? 0,
    debt: readNumber(fieldValue(review, "debt")) ?? 0,
    sharesOutstanding: readNumber(fieldValue(review, "sharesOutstanding")) ?? 0,
    source: "import",
  };
  return {
    listingId: company.id,
    approvedAt: new Date().toISOString(),
    company: { ...company, coverageState: "valuation_ready" as const },
    symbol: company.symbol,
    name: company.name,
    filingCurrency: currency,
    currency,
    source: "import",
    sourceLinks,
    provenance: {
      sourceSystem: "User-reviewed import",
      sourceLinks,
      artifacts,
    },
    statements: [statement],
  };
};

export async function POST(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:company:import:approve",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_IMPORT_APPROVE_PER_MINUTE", 12),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }
  if (!(await isInternalPersistenceRequest(request))) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
  }

  let payload: ApprovePayload;
  try {
    payload = (await request.json()) as ApprovePayload;
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
  }
  if (!payload.company || !payload.review) {
    return errorResponse("BAD_REQUEST", "Missing company or review", 400);
  }
  const validationError = validateReview(payload.review);
  if (validationError) {
    return errorResponse("BAD_REQUEST", validationError, 400);
  }

  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Import persistence backend is not configured",
      503,
    );
  }

  const artifacts = payload.artifacts ?? [];
  const importedFacts = buildImportedFacts(payload.company, payload.review, artifacts);
  const assumptions = payload.assumptions ?? cloneScenarioAssumptions();
  const workbenchPayload = buildWorkbenchPayloadFromFacts(
    { symbol: payload.company.symbol, scenario: "base", assumptions },
    {
      symbol: payload.company.symbol,
      name: payload.company.name,
      currency: importedFacts.currency,
      filingCurrency: importedFacts.filingCurrency,
      source: "import",
      sourceSystem: "User-reviewed import",
      sourceLinks: importedFacts.sourceLinks,
      statements: importedFacts.statements,
    },
  );

  let result: Record<string, unknown>;
  try {
    result = await fetchDcfEngine<Record<string, unknown>>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify({
        ...workbenchPayload,
        includeTrace: true,
        monteCarlo: { runs: 25000, bins: 120, seed: 7 },
      }),
    });
  } catch (error) {
    console.error("Imported valuation compute failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse("DCF_ENGINE_ERROR", "DCF compute failed", status);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    await (convexClient as any).mutation("imports:approveImportedFacts" as any, {
      syncToken,
      listingId: payload.company.id,
      symbol: payload.company.symbol,
      name: payload.company.name,
      exchangeMic: payload.company.exchangeMic ?? undefined,
      market: payload.company.market ?? undefined,
      country: payload.company.country ?? undefined,
      currency: importedFacts.currency,
      coverageState: "valuation_ready",
      filingCurrency: importedFacts.filingCurrency,
      facts: importedFacts,
      review: payload.review,
      provenance: importedFacts.provenance,
      sourceLinks: importedFacts.sourceLinks,
      artifactIds: artifacts.map((artifact) => artifact.id),
    });

    const traceByteSize = Buffer.byteLength(JSON.stringify(result));
    const base = typeof result.base === "object" && result.base ? result.base as Record<string, unknown> : null;
    const bull = typeof result.bull === "object" && result.bull ? result.bull as Record<string, unknown> : null;
    const bear = typeof result.bear === "object" && result.bear ? result.bear as Record<string, unknown> : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    await (convexClient as any).mutation("valuations:create" as any, {
      syncToken,
      engineVersion: "workbench-v1",
      status: "success",
      inputs: workbenchPayload,
      provenance: importedFacts.provenance,
      resultSummary: {
        base: base?.valuation,
        bull: bull?.valuation,
        bear: bear?.valuation,
        kpis: result.kpis,
        monteCarlo: result.monteCarlo,
      },
      primaryKeyNorm: payload.company.id.toLowerCase(),
      regionCode: payload.company.country ?? undefined,
      asOfDate: importedFacts.statements[0]?.periodEnd,
      traceStorage: "inline",
      trace: result,
      traceByteSize,
      requestId: `import:${payload.company.id}:${Date.now()}`,
      symbol: payload.company.symbol,
    });
  } catch (error) {
    console.error("Import approval persistence failed", error);
    return errorResponse("PERSISTENCE_ERROR", "Import approval failed", 502);
  }

  return NextResponse.json({ importedFacts, result });
}
