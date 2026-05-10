import { createInternalPersistenceHeaders } from "@/app/api/_lib/internalAuth";
import { errorResponse } from "@/app/api/_lib/errors";
import { GET as getImportContext } from "@/app/api/company/import/context/route";

const RATE_LIMIT_IDENTITY_HEADERS = [
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
];

const browserImportContextReadsEnabled = (): boolean =>
  process.env.VALUATION_HISTORY_BROWSER_READS === "1";

export async function GET(request: Request) {
  if (!browserImportContextReadsEnabled()) {
    return errorResponse("NOT_FOUND", "Not found", 404);
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
  for (const headerName of RATE_LIMIT_IDENTITY_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  return getImportContext(
    new Request(internalUrl, {
      method: "GET",
      headers,
    }),
  );
}
