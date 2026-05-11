import { createHash, timingSafeEqual } from "crypto";

import { createInternalPersistenceHeaders } from "@/app/api/_lib/internalAuth";
import { errorResponse } from "@/app/api/_lib/errors";
import { POST as approveImport } from "@/app/api/company/import/approve/route";

const IMPORT_APPROVAL_TOKEN_HEADER = "x-import-approval-token";
const MAX_IMPORT_APPROVAL_TOKEN_BYTES = 256;
const RATE_LIMIT_IDENTITY_HEADERS = [
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
];

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

const isAuthorizedBrowserApprovalRequest = (request: Request): boolean => {
  const expectedHash = process.env.IMPORT_APPROVAL_BROWSER_TOKEN_SHA256?.trim().toLowerCase();
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  const token = request.headers.get(IMPORT_APPROVAL_TOKEN_HEADER)?.trim();
  if (!token || Buffer.byteLength(token, "utf8") > MAX_IMPORT_APPROVAL_TOKEN_BYTES) {
    return false;
  }
  return safeCompare(sha256Hex(token), expectedHash);
};

export async function POST(request: Request) {
  if (process.env.IMPORT_APPROVAL_BROWSER_WRITES !== "1") {
    return errorResponse("NOT_FOUND", "Not found", 404);
  }
  if (!isAuthorizedBrowserApprovalRequest(request)) {
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

  const body = await request.text();
  const url = new URL("/api/company/import/approve", request.url).toString();
  const authHeaders = createInternalPersistenceHeaders({
    secret,
    method: "POST",
    url,
    body,
  });
  const headers = new Headers(authHeaders);
  headers.set("Content-Type", request.headers.get("Content-Type") ?? "application/json");
  for (const headerName of RATE_LIMIT_IDENTITY_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  return approveImport(
    new Request(url, {
      method: "POST",
      headers,
      body,
    }),
  );
}
