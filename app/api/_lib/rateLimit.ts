import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { isIP } from "node:net";

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

const ipFromHeader = (request: Request, headerName: string): string | null =>
  normalizeIp(request.headers.get(headerName));

const ipFromForwardedHeader = (request: Request, headerName: string): string | null =>
  normalizeIp(firstForwardedIp(request.headers.get(headerName)));

const trustedClientIdentifier = (request: Request): string | null => {
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
  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
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
    return null;
  }
};

export const enforceRateLimit = async (
  request: Request,
  rule: RateLimitRule,
): Promise<{
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: RateLimitReason;
}> => {
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

export const resetRateLimitStateForTests = () => {
  // No-op: rate-limit state is stored in Convex.
};
