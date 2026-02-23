import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";

const INTERNAL_PERSISTENCE_SIGNATURE_HEADER = "x-dcf-internal-signature";
const INTERNAL_PERSISTENCE_TIMESTAMP_HEADER = "x-dcf-internal-ts";
const INTERNAL_PERSISTENCE_NONCE_HEADER = "x-dcf-internal-nonce";
const INTERNAL_PERSISTENCE_MAX_SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = INTERNAL_PERSISTENCE_MAX_SKEW_MS;

type NonceState = {
  expiresAt: number;
};

const seenNonces = new Map<string, NonceState>();

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

const cleanExpiredNonces = (now: number) => {
  if (seenNonces.size < 2_000) {
    return;
  }
  for (const [nonce, state] of seenNonces) {
    if (state.expiresAt <= now) {
      seenNonces.delete(nonce);
    }
  }
};

const isReplay = (nonce: string, now: number): boolean => {
  cleanExpiredNonces(now);
  const state = seenNonces.get(nonce);
  if (!state) {
    return false;
  }
  if (state.expiresAt <= now) {
    seenNonces.delete(nonce);
    return false;
  }
  return true;
};

const markNonce = (nonce: string, now: number) => {
  seenNonces.set(nonce, { expiresAt: now + NONCE_TTL_MS });
};

const isFreshTimestamp = (timestampMs: number, now: number): boolean => {
  return Math.abs(now - timestampMs) <= INTERNAL_PERSISTENCE_MAX_SKEW_MS;
};

const readBodyForSignature = async (request: Request): Promise<string> => {
  if (request.method === "GET" || request.method === "HEAD") {
    return "";
  }
  try {
    return await request.clone().text();
  } catch {
    return "";
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
  if (isReplay(nonce, now)) {
    return false;
  }

  const body = await readBodyForSignature(request);
  const payload = canonicalPayload({
    method: request.method.toUpperCase(),
    pathAndQuery: canonicalPath(request.url),
    timestampMs: String(parsedTimestamp),
    nonce,
    bodyHash: sha256Hex(body),
  });
  const expected = hmacHex(secret, payload);
  if (!safeCompare(signature, expected)) {
    return false;
  }

  markNonce(nonce, now);
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
  seenNonces.clear();
};

export const internalPersistenceHeaderName = INTERNAL_PERSISTENCE_SIGNATURE_HEADER;
export const internalPersistenceTimestampHeaderName = INTERNAL_PERSISTENCE_TIMESTAMP_HEADER;
export const internalPersistenceNonceHeaderName = INTERNAL_PERSISTENCE_NONCE_HEADER;
