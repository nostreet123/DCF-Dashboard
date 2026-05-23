import { BodyLimitError, readTextWithLimit } from "@/app/api/_lib/body";
import { createInternalPersistenceHeaders } from "@/app/api/_lib/internalAuth";
import { isAuthorizedBrowserTokenRequest } from "@/app/api/_lib/browserTokenAuth";
import {
  browserImportApprovalWritesEnabled,
  setRateLimitIdentityHeaders,
} from "@/app/api/_lib/browserRouteGuards";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  enforceGlobalRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { POST as approveImport } from "@/app/api/company/import/approve/route";

const INTERNAL_APPROVAL_CLIENT_IP = "127.0.0.1";

export async function POST(request: Request) {
  if (!browserImportApprovalWritesEnabled()) {
    return errorResponse("NOT_FOUND", "Not found", 404);
  }
  if (!isAuthorizedBrowserTokenRequest(request, "import-approval")) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
  }
  const secret = process.env.INTERNAL_PERSISTENCE_KEY;
  if (!secret) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Import approval is not configured",
      503,
    );
  }

  const rateLimit = await enforceGlobalRateLimit({
    key: "api:company:import:approve:browser",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_IMPORT_APPROVE_BROWSER_PER_MINUTE", 12),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  let body: string;
  try {
    body = await readTextWithLimit(request);
  } catch (error) {
    if (error instanceof BodyLimitError) {
      return errorResponse("PAYLOAD_TOO_LARGE", error.message, 413);
    }
    return errorResponse("BAD_REQUEST", "Invalid request body", 400);
  }

  const url = new URL("/api/company/import/approve", request.url).toString();
  const authHeaders = createInternalPersistenceHeaders({
    secret,
    method: "POST",
    url,
    body,
  });
  const headers = new Headers(authHeaders);
  headers.set("Content-Type", request.headers.get("Content-Type") ?? "application/json");
  setRateLimitIdentityHeaders(headers, {
    "x-vercel-forwarded-for": INTERNAL_APPROVAL_CLIENT_IP,
    "cf-connecting-ip": INTERNAL_APPROVAL_CLIENT_IP,
    "x-real-ip": INTERNAL_APPROVAL_CLIENT_IP,
  });

  return approveImport(
    new Request(url, {
      method: "POST",
      headers,
      body,
    }),
  );
}
