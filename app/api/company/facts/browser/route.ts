import { createInternalPersistenceHeaders } from "@/app/api/_lib/internalAuth";
import { isAuthorizedBrowserTokenRequest } from "@/app/api/_lib/browserTokenAuth";
import {
  browserCompanyFactsReadsEnabled,
  copyRateLimitIdentityHeaders,
} from "@/app/api/_lib/browserRouteGuards";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { GET as getCompanyFacts } from "@/app/api/company/facts/route";

const BROWSER_COMPANY_FACTS_RATE_LIMIT_KEY = "api:company:facts:browser";

export async function GET(request: Request) {
  if (!browserCompanyFactsReadsEnabled()) {
    return errorResponse("NOT_FOUND", "Not found", 404);
  }

  const rateLimit = await enforceRateLimit(request, {
    key: BROWSER_COMPANY_FACTS_RATE_LIMIT_KEY,
    limit: getRateLimitPerMinute("API_RATE_LIMIT_COMPANY_FACTS_BROWSER_PER_MINUTE", 60),
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
      "Company facts browser reads are not configured",
      503,
    );
  }

  const requestUrl = new URL(request.url);
  const internalUrl = new URL("/api/company/facts", request.url);
  internalUrl.search = requestUrl.search;
  const authHeaders = createInternalPersistenceHeaders({
    secret,
    method: "GET",
    url: internalUrl.toString(),
  });
  const headers = new Headers(authHeaders);
  copyRateLimitIdentityHeaders(request, headers);

  return getCompanyFacts(
    new Request(internalUrl, {
      method: "GET",
      headers,
    }),
  );
}
