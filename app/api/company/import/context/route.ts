import { NextResponse } from "next/server";

import { convexConfigured } from "@/app/api/_lib/convexServer";
import { errorResponse } from "@/app/api/_lib/errors";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { loadConvexImportContext } from "@/lib/import/convexImportContext";

const readParams = (request: Request) => {
  const { searchParams } = new URL(request.url);
  return {
    listingId: searchParams.get("listingId")?.trim() ?? searchParams.get("id")?.trim() ?? null,
    symbol: searchParams.get("symbol")?.trim() ?? null,
  };
};

export async function GET(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:company:import:context",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_COMPANY_IMPORT_CONTEXT_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }
  if (!(await isInternalPersistenceRequest(request))) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
  }

  const { listingId, symbol } = readParams(request);
  if (!listingId && !symbol) {
    return errorResponse("BAD_REQUEST", "Specify listingId or symbol", 400);
  }

  if (!convexConfigured()) {
    return NextResponse.json({ importedFacts: null, artifacts: [] });
  }

  try {
    const { importedFacts, artifacts } = await loadConvexImportContext({ listingId, symbol });
    return NextResponse.json({ importedFacts, artifacts });
  } catch (error) {
    console.error("Import context fetch failed", error);
    return errorResponse("IMPORT_CONTEXT_ERROR", "Import context fetch failed", 502);
  }
}
