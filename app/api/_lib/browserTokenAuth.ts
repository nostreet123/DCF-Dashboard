import { createHash, timingSafeEqual } from "crypto";

export const IMPORT_CONTEXT_TOKEN_HEADER = "x-import-context-token";
export const IMPORT_APPROVAL_TOKEN_HEADER = "x-import-approval-token";

export const MAX_IMPORT_CONTEXT_TOKEN_BYTES = 256;
export const MAX_IMPORT_APPROVAL_TOKEN_BYTES = 256;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const timingSafeCompareHex = (provided: string, expected: string): boolean => {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
};

export type BrowserTokenKind = "import-context" | "import-approval";

const tokenConfig = (kind: BrowserTokenKind) => {
  if (kind === "import-approval") {
    return {
      header: IMPORT_APPROVAL_TOKEN_HEADER,
      envVar: "IMPORT_APPROVAL_BROWSER_TOKEN_SHA256",
      maxBytes: MAX_IMPORT_APPROVAL_TOKEN_BYTES,
    } as const;
  }
  return {
    header: IMPORT_CONTEXT_TOKEN_HEADER,
    envVar: "IMPORT_CONTEXT_BROWSER_TOKEN_SHA256",
    maxBytes: MAX_IMPORT_CONTEXT_TOKEN_BYTES,
  } as const;
};

export const readBrowserTokenFromRequest = (
  request: Request,
  kind: BrowserTokenKind,
): string | null => {
  const { header, maxBytes } = tokenConfig(kind);
  const token = request.headers.get(header)?.trim();
  if (!token || Buffer.byteLength(token, "utf8") > maxBytes) {
    return null;
  }
  return token;
};

export const isAuthorizedBrowserTokenRequest = (
  request: Request,
  kind: BrowserTokenKind,
): boolean => {
  const { envVar } = tokenConfig(kind);
  const expectedHash = process.env[envVar]?.trim().toLowerCase();
  if (!expectedHash || !SHA256_HEX_PATTERN.test(expectedHash)) {
    return false;
  }
  const token = readBrowserTokenFromRequest(request, kind);
  if (!token) {
    return false;
  }
  return timingSafeCompareHex(sha256Hex(token), expectedHash);
};
