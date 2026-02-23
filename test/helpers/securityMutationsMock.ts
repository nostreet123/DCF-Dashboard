import { ConvexHttpClient } from "convex/browser";

type NonceState = {
  status: "pending" | "used";
  expiresAt: number;
};

type RateBucketState = {
  count: number;
  resetAt: number;
};

type SecurityMockOptions = {
  fallbackMutation?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
};

export const installSecurityMutationsMock = (options: SecurityMockOptions = {}) => {
  const originalMutation = ConvexHttpClient.prototype.mutation;
  const nonces = new Map<string, NonceState>();
  const buckets = new Map<string, RateBucketState>();
  const calls: string[] = [];

  ConvexHttpClient.prototype.mutation = (async (
    name: string,
    args: Record<string, unknown> = {},
  ) => {
    calls.push(name);

    if (name === "securityAuth:reserveNonce") {
      const nonce = String(args.nonce);
      const ttlMs = Number(args.ttlMs);
      const nowMs = Number(args.nowMs ?? Date.now());
      const existing = nonces.get(nonce);
      if (existing && existing.expiresAt > nowMs) {
        return { reserved: false };
      }
      nonces.set(nonce, { status: "pending", expiresAt: nowMs + ttlMs });
      return { reserved: true };
    }

    if (name === "securityAuth:markNonceUsed") {
      const nonce = String(args.nonce);
      const ttlMs = Number(args.ttlMs);
      const nowMs = Number(args.nowMs ?? Date.now());
      const existing = nonces.get(nonce);
      if (!existing || existing.status !== "pending" || existing.expiresAt <= nowMs) {
        return { marked: false };
      }
      nonces.set(nonce, { status: "used", expiresAt: nowMs + ttlMs });
      return { marked: true };
    }

    if (name === "securityAuth:releasePendingNonce") {
      const nonce = String(args.nonce);
      const existing = nonces.get(nonce);
      if (existing?.status === "pending") {
        nonces.delete(nonce);
        return { released: 1 };
      }
      return { released: 0 };
    }

    if (name === "securityRateLimit:hitBucket") {
      const bucketKey = String(args.bucketKey);
      const limit = Number(args.limit);
      const windowMs = Number(args.windowMs);
      const nowMs = Number(args.nowMs ?? Date.now());
      const existing = buckets.get(bucketKey);
      if (!existing || existing.resetAt <= nowMs) {
        buckets.set(bucketKey, {
          count: 1,
          resetAt: nowMs + windowMs,
        });
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
      buckets.set(bucketKey, existing);
      return { allowed: true };
    }

    if (options.fallbackMutation) {
      return await options.fallbackMutation(name, args);
    }
    return {};
  }) as ConvexHttpClient["mutation"];

  return {
    calls,
    restore: () => {
      ConvexHttpClient.prototype.mutation = originalMutation;
    },
    reset: () => {
      nonces.clear();
      buckets.clear();
      calls.length = 0;
    },
  };
};
