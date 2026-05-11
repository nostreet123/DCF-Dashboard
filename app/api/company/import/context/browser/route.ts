import { createHash, timingSafeEqual } from "crypto";

import { createInternalPersistenceHeaders } from "@/app/api/_lib/internalAuth";
import { errorResponse } from "@/app/api/_lib/errors";
import { GET as getImportContext } from "@/app/api/company/import/context/route";

const IMPORT_CONTEXT_TOKEN_HEADER = "x-import-context-token";
const MAX_IMPORT_CONTEXT_TOKEN_BYTES = 256;
const RATE_LIMIT_IDENTITY_HEADERS = [
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
];

const browserImportContextReadsEnabled = (): boolean =>
  process.env.VALUATION_HISTORY_BROWSER_READS === "1";

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const safeCompare = (provided: string, expected: string): boolean => {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
};

const isAuthorizedBrowserContextRequest = (request: Request): boolean => {
  const expectedHash = process.env.IMPORT_CONTEXT_BROWSER_TOKEN_SHA256?.trim().toLowerCase();
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  const token = request.headers.get(IMPORT_CONTEXT_TOKEN_HEADER)?.trim();
  if (!token || Buffer.byteLength(token, "utf8") > MAX_IMPORT_CONTEXT_TOKEN_BYTES) {
    return false;
  }
  return safeCompare(sha256Hex(token), expectedHash);
};

export async function GET(request: Request) {
  if (!browserImportContextReadsEnabled()) {
    return errorResponse("NOT_FOUND", "Not found", 404);
  }
  if (!isAuthorizedBrowserContextRequest(request)) {
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
  // Preserve the browser caller identity so the signed internal read keeps
  // the same rate-limit and audit boundary as a direct server-side read.
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
