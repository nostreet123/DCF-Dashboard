import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { isIP } from "node:net";
import { errorResponse } from "@/app/api/_lib/errors";

type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
};

type IdentityMode = "strict" | "compat";
type IdentitySource = "vercel" | "legacy" | "compat";

type HitBucketResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export type RateLimitReason =
  | "RATE_LIMITED"
  | "UNTRUSTED_IDENTITY"
  | "BACKEND_UNAVAILABLE";

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: RateLimitReason;
};

const localBuckets = new Map<string, { count: number; resetAt: number }>();

const REAL_IP_HEADER = "x-real-ip";
const CF_CONNECTING_IP_HEADER = "cf-connecting-ip";
const FORWARDED_FOR_HEADER = "x-forwarded-for";
const VERCEL_FORWARDED_FOR_HEADER = "x-vercel-forwarded-for";

const firstForwardedIp = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const first = value.split(",")[0]?.trim();
  return first || null;
};

const normalizeIp = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  let candidate = value.trim();
  if (!candidate) {
    return null;
  }
  if (candidate.startsWith("::ffff:")) {
    candidate = candidate.slice("::ffff:".length);
  }
  if (isIP(candidate) === 0) {
    return null;
  }
  return candidate;
};

const getIdentityMode = (): IdentityMode =>
  process.env.RATE_LIMIT_IDENTITY_MODE === "compat" ? "compat" : "strict";

const getIdentitySource = (): IdentitySource => {
  const value = process.env.RATE_LIMIT_IDENTITY_SOURCE;
  if (value === "legacy" || value === "compat") {
    return value;
  }
  return "vercel";
};

const isLocalDevelopment = () =>
  process.env.NODE_ENV === "development" ||
  process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST === "1";

const localDevelopmentIdentifier = (request: Request): string | null => {
  if (!isLocalDevelopment()) {
    return null;
  }
  const url = new URL(request.url);
  if (
    url.hostname === "localhost" ||
    url.hostname === "0.0.0.0" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  ) {
    return "local-dev";
  }
  return null;
};

const ipFromHeader = (request: Request, headerName: string): string | null =>
  normalizeIp(request.headers.get(headerName));

const ipFromForwardedHeader = (request: Request, headerName: string): string | null =>
  normalizeIp(firstForwardedIp(request.headers.get(headerName)));

const trustedClientIdentifier = (request: Request): string | null => {
  const localId = localDevelopmentIdentifier(request);
  if (localId) {
    return localId;
  }

  const source = getIdentitySource();
  if (source === "vercel") {
    return ipFromForwardedHeader(request, VERCEL_FORWARDED_FOR_HEADER);
  }

  const cfIp = ipFromHeader(request, CF_CONNECTING_IP_HEADER);
  if (cfIp) {
    return cfIp;
  }

  const realIp = ipFromHeader(request, REAL_IP_HEADER);
  if (realIp) {
    return realIp;
  }

  if (source === "compat" && getIdentityMode() === "compat") {
    return ipFromForwardedHeader(request, FORWARDED_FOR_HEADER);
  }

  return null;
};

const hitRateLimitBucket = async (
  bucketKey: string,
  limit: number,
  windowMs: number,
): Promise<HitBucketResult | null> => {
  const hitLocalBucket = (): HitBucketResult => {
    const nowMs = Date.now();
    const existing = localBuckets.get(bucketKey);
    if (!existing || existing.resetAt <= nowMs) {
      localBuckets.set(bucketKey, { count: 1, resetAt: nowMs + windowMs });
      return { allowed: true };
    }
    if (existing.count >= limit) {
      const retryMs = Math.max(0, existing.resetAt - nowMs);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
      };
    }
    existing.count += 1;
    localBuckets.set(bucketKey, existing);
    return { allowed: true };
  };

  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
    if (isLocalDevelopment()) {
      return hitLocalBucket();
    }
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    return await (convexClient as any).mutation("securityRateLimit:hitBucket" as any, {
      syncToken,
      bucketKey,
      limit,
      windowMs,
      nowMs: Date.now(),
    });
  } catch (error) {
    console.warn("Rate-limit mutation failed", error);
    if (isLocalDevelopment()) {
      return hitLocalBucket();
    }
    return null;
  }
};

export const enforceRateLimit = async (
  request: Request,
  rule: RateLimitRule,
): Promise<RateLimitDecision> => {
  const clientId = trustedClientIdentifier(request);
  if (!clientId) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
      reason: "UNTRUSTED_IDENTITY",
    };
  }

  const bucketKey = `${rule.key}:ip:${clientId}`;
  const result = await hitRateLimitBucket(bucketKey, rule.limit, rule.windowMs);
  if (!result) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
      reason: "BACKEND_UNAVAILABLE",
    };
  }

  if (!result.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: result.retryAfterSeconds,
      reason: "RATE_LIMITED",
    };
  }

  return { allowed: true };
};

export const enforceGlobalRateLimit = async (
  rule: RateLimitRule,
): Promise<RateLimitDecision> => {
  const result = await hitRateLimitBucket(`${rule.key}:global`, rule.limit, rule.windowMs);
  if (!result) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
      reason: "BACKEND_UNAVAILABLE",
    };
  }

  if (!result.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: result.retryAfterSeconds,
      reason: "RATE_LIMITED",
    };
  }

  return { allowed: true };
};

export const getRateLimitPerMinute = (envKey: string, defaultValue: number): number => {
  const raw = process.env[envKey];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
};

export const rateLimitErrorResponse = (decision: RateLimitDecision) => {
  if (decision.reason === "UNTRUSTED_IDENTITY") {
    return errorResponse(
      "UNTRUSTED_IDENTITY",
      "Request origin could not be verified",
      429,
      {
        "Retry-After": String(decision.retryAfterSeconds ?? 60),
      },
    );
  }

  if (decision.reason === "BACKEND_UNAVAILABLE") {
    return errorResponse("RATE_LIMIT_UNAVAILABLE", "Rate-limit backend unavailable", 503);
  }

  return errorResponse("RATE_LIMITED", "Too many requests", 429, {
    "Retry-After": String(decision.retryAfterSeconds ?? 60),
  });
};

export const resetRateLimitStateForTests = () => {
  localBuckets.clear();
};
