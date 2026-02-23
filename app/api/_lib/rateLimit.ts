const REAL_IP_HEADER = "x-real-ip";
const CF_CONNECTING_IP_HEADER = "cf-connecting-ip";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
};

const buckets = new Map<string, Bucket>();

const clientIdentifier = (request: Request): string => {
  // Only trust edge headers controlled by known infra layers.
  const cfIp = request.headers.get(CF_CONNECTING_IP_HEADER)?.trim();
  if (cfIp) {
    return `ip:${cfIp}`;
  }
  const realIp = request.headers.get(REAL_IP_HEADER)?.trim();
  if (realIp) {
    return `ip:${realIp}`;
  }
  return "untrusted";
};

const gcExpiredBuckets = (now: number) => {
  if (buckets.size < 2_000) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
};

export const enforceRateLimit = (
  request: Request,
  rule: RateLimitRule,
): { allowed: boolean; retryAfterSeconds?: number } => {
  const now = Date.now();
  gcExpiredBuckets(now);

  const key = `${rule.key}:${clientIdentifier(request)}`;
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true };
  }

  if (existing.count >= rule.limit) {
    const retryMs = Math.max(0, existing.resetAt - now);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
  }

  existing.count += 1;
  buckets.set(key, existing);
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
  buckets.clear();
};
