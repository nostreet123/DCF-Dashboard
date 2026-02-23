import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";

import { DEFAULT_JSON_BODY_LIMIT_BYTES } from "@/app/api/_lib/body";
import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";

const INTERNAL_PERSISTENCE_SIGNATURE_HEADER = "x-dcf-internal-signature";
const INTERNAL_PERSISTENCE_TIMESTAMP_HEADER = "x-dcf-internal-ts";
const INTERNAL_PERSISTENCE_NONCE_HEADER = "x-dcf-internal-nonce";
const INTERNAL_PERSISTENCE_MAX_SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = INTERNAL_PERSISTENCE_MAX_SKEW_MS;
const INTERNAL_PERSISTENCE_MAX_BODY_BYTES = DEFAULT_JSON_BODY_LIMIT_BYTES;

type SecurityAuthMutationName =
  | "securityAuth:reserveNonce"
  | "securityAuth:markNonceUsed"
  | "securityAuth:releasePendingNonce";

type ReserveNonceResult = {
  reserved: boolean;
};

type MarkNonceUsedResult = {
  marked: boolean;
};

const safeCompare = (provided: string, expected: string): boolean => {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
};

const sha256Hex = (value: string): string => {
  return createHash("sha256").update(value, "utf8").digest("hex");
};

const hmacHex = (secret: string, value: string): string => {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
};

const canonicalPath = (requestUrl: string): string => {
  const url = new URL(requestUrl);
  return `${url.pathname}${url.search}`;
};

const canonicalPayload = ({
  method,
  pathAndQuery,
  timestampMs,
  nonce,
  bodyHash,
}: {
  method: string;
  pathAndQuery: string;
  timestampMs: string;
  nonce: string;
  bodyHash: string;
}) => `${method}\n${pathAndQuery}\n${timestampMs}\n${nonce}\n${bodyHash}`;

const isFreshTimestamp = (timestampMs: number, now: number): boolean => {
  return Math.abs(now - timestampMs) <= INTERNAL_PERSISTENCE_MAX_SKEW_MS;
};

const callSecurityAuthMutation = async <T>(
  name: SecurityAuthMutationName,
  args: Record<string, unknown>,
): Promise<T | null> => {
  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    return await (convexClient as any).mutation(name as any, { syncToken, ...args });
  } catch (error) {
    console.warn("Internal auth mutation failed", error);
    return null;
  }
};

const reserveNonce = async (nonce: string, now: number) => {
  const result = await callSecurityAuthMutation<ReserveNonceResult>(
    "securityAuth:reserveNonce",
    { nonce, ttlMs: NONCE_TTL_MS, nowMs: now },
  );
  return result?.reserved === true;
};

const markNonceUsed = async (nonce: string, now: number) => {
  const result = await callSecurityAuthMutation<MarkNonceUsedResult>(
    "securityAuth:markNonceUsed",
    { nonce, ttlMs: NONCE_TTL_MS, nowMs: now },
  );
  return result?.marked === true;
};

const releasePendingNonce = async (nonce: string) => {
  await callSecurityAuthMutation("securityAuth:releasePendingNonce", { nonce });
};

const hashBodyForSignature = async (
  request: Request,
  maxBytes: number,
): Promise<string | null> => {
  if (request.method === "GET" || request.method === "HEAD") {
    return sha256Hex("");
  }

  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > maxBytes) {
      return null;
    }
  }

  try {
    const cloned = request.clone();
    const reader = cloned.body?.getReader();
    if (!reader) {
      const bodyText = await cloned.text();
      if (Buffer.byteLength(bodyText, "utf8") > maxBytes) {
        return null;
      }
      return sha256Hex(bodyText);
    }

    const hash = createHash("sha256");
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          return null;
        }
        hash.update(Buffer.from(value));
      }
    }
    return hash.digest("hex");
  } catch {
    return null;
  }
};

export const isInternalPersistenceRequest = async (request: Request): Promise<boolean> => {
  const secret = process.env.INTERNAL_PERSISTENCE_KEY;
  if (!secret) {
    return false;
  }

  const signature = request.headers.get(INTERNAL_PERSISTENCE_SIGNATURE_HEADER)?.trim();
  const timestamp = request.headers.get(INTERNAL_PERSISTENCE_TIMESTAMP_HEADER)?.trim();
  const nonce = request.headers.get(INTERNAL_PERSISTENCE_NONCE_HEADER)?.trim();
  if (!signature || !timestamp || !nonce) {
    return false;
  }

  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp) || !Number.isInteger(parsedTimestamp)) {
    return false;
  }

  const now = Date.now();
  if (!isFreshTimestamp(parsedTimestamp, now)) {
    return false;
  }
  if (!(await reserveNonce(nonce, now))) {
    return false;
  }

  const bodyHash = await hashBodyForSignature(request, INTERNAL_PERSISTENCE_MAX_BODY_BYTES);
  if (!bodyHash) {
    await releasePendingNonce(nonce);
    return false;
  }

  const payload = canonicalPayload({
    method: request.method.toUpperCase(),
    pathAndQuery: canonicalPath(request.url),
    timestampMs: String(parsedTimestamp),
    nonce,
    bodyHash,
  });
  const expected = hmacHex(secret, payload);
  if (!safeCompare(signature, expected)) {
    await releasePendingNonce(nonce);
    return false;
  }

  if (!(await markNonceUsed(nonce, now))) {
    return false;
  }
  return true;
};

export const createInternalPersistenceHeaders = ({
  secret,
  method,
  url,
  body = "",
  nonce = randomUUID(),
  timestampMs = Date.now(),
}: {
  secret: string;
  method: string;
  url: string;
  body?: string;
  nonce?: string;
  timestampMs?: number;
}): Record<string, string> => {
  const payload = canonicalPayload({
    method: method.toUpperCase(),
    pathAndQuery: canonicalPath(url),
    timestampMs: String(timestampMs),
    nonce,
    bodyHash: sha256Hex(body),
  });
  const signature = hmacHex(secret, payload);
  return {
    [INTERNAL_PERSISTENCE_SIGNATURE_HEADER]: signature,
    [INTERNAL_PERSISTENCE_TIMESTAMP_HEADER]: String(timestampMs),
    [INTERNAL_PERSISTENCE_NONCE_HEADER]: nonce,
  };
};

export const resetInternalAuthStateForTests = () => {
  // No-op: nonce replay state is stored in Convex.
};

export const internalPersistenceHeaderName = INTERNAL_PERSISTENCE_SIGNATURE_HEADER;
export const internalPersistenceTimestampHeaderName = INTERNAL_PERSISTENCE_TIMESTAMP_HEADER;
export const internalPersistenceNonceHeaderName = INTERNAL_PERSISTENCE_NONCE_HEADER;
