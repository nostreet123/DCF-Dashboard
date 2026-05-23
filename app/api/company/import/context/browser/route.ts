import { createInternalPersistenceHeaders } from "@/app/api/_lib/internalAuth";
import { isAuthorizedBrowserTokenRequest } from "@/app/api/_lib/browserTokenAuth";
import {
  browserImportContextReadsEnabled,
  copyRateLimitIdentityHeaders,
} from "@/app/api/_lib/browserRouteGuards";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { GET as getImportContext } from "@/app/api/company/import/context/route";

const BROWSER_IMPORT_CONTEXT_RATE_LIMIT_KEY = "api:company:import:context:browser";

export async function GET(request: Request) {
  if (!browserImportContextReadsEnabled()) {
    return errorResponse("NOT_FOUND", "Not found", 404);
  }

  const rateLimit = await enforceRateLimit(request, {
    key: BROWSER_IMPORT_CONTEXT_RATE_LIMIT_KEY,
    limit: getRateLimitPerMinute("API_RATE_LIMIT_COMPANY_IMPORT_CONTEXT_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  if (!isAuthorizedBrowserTokenRequest(request, "import-context")) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
  }

  const secret = process.env.INTERNAL_PERSISTENCE_KEY;
  if (!secret) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Import context is not configured",
      503,
    );
  }

  const requestUrl = new URL(request.url);
  const internalUrl = new URL("/api/company/import/context", request.url);
  internalUrl.search = requestUrl.search;
  const authHeaders = createInternalPersistenceHeaders({
    secret,
    method: "GET",
    url: internalUrl.toString(),
  });
  const headers = new Headers(authHeaders);
  copyRateLimitIdentityHeaders(request, headers);

  return getImportContext(
    new Request(internalUrl, {
      method: "GET",
      headers,
    }),
  );
}
