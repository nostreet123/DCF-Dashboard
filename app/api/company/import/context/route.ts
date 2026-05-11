import { NextResponse } from "next/server";

import { getConvexClient } from "@/app/api/_lib/convex";
import { errorResponse } from "@/app/api/_lib/errors";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";

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

  const convexClient = getConvexClient();
  if (!convexClient) {
    return NextResponse.json({ importedFacts: null, artifacts: [] });
  }

  try {
    let importedFacts: unknown = null;
    if (listingId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      importedFacts = await (convexClient as any).query("imports:getImportedFacts" as any, {
        listingId,
      });
    }
    if (!importedFacts && symbol) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      const matches = await (convexClient as any).query("imports:listBySymbol" as any, {
        symbol,
        limit: 1,
      });
      importedFacts = Array.isArray(matches) ? matches[0] ?? null : null;
    }

    const resolvedListingId =
      importedFacts &&
      typeof importedFacts === "object" &&
      !Array.isArray(importedFacts) &&
      typeof (importedFacts as { listingId?: unknown }).listingId === "string"
        ? (importedFacts as { listingId: string }).listingId
        : listingId;
    const artifactIds =
      importedFacts &&
      typeof importedFacts === "object" &&
      !Array.isArray(importedFacts) &&
      Array.isArray((importedFacts as { artifactIds?: unknown }).artifactIds)
        ? new Set((importedFacts as { artifactIds: unknown[] }).artifactIds)
        : null;
    let artifacts: unknown[] = [];
    if (resolvedListingId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
      const allArtifacts = await (convexClient as any).query("imports:listArtifactsForListing" as any, {
        listingId: resolvedListingId,
        status: "approved",
        limit: 20,
      });
      artifacts = Array.isArray(allArtifacts)
        ? allArtifacts.filter((artifact) => {
            if (!artifactIds) {
              return true;
            }
            return (
              artifact &&
              typeof artifact === "object" &&
              !Array.isArray(artifact) &&
              artifactIds.has((artifact as { artifactId?: unknown }).artifactId)
            );
          })
        : [];
    }

    return NextResponse.json({ importedFacts, artifacts });
  } catch (error) {
    console.error("Import context fetch failed", error);
    return errorResponse("IMPORT_CONTEXT_ERROR", "Import context fetch failed", 502);
  }
}
