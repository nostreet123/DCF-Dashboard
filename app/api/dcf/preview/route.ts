import { NextResponse } from "next/server";

import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { enforceRateLimit, getRateLimitPerMinute } from "@/app/api/_lib/rateLimit";
import {
  parseMonteCarloPreset,
  sanitizePayload,
} from "@/app/api/_lib/monteCarloPreset";

export async function POST(request: Request) {
  const rateLimit = enforceRateLimit(request, {
    key: "api:dcf:preview",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE", 30),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return errorResponse("RATE_LIMITED", "Too many requests", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await parseJsonWithLimit<Record<string, unknown>>(request);
  } catch (error) {
    if (error instanceof BodyLimitError) {
      return errorResponse("PAYLOAD_TOO_LARGE", error.message, 413);
    }
    return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
  }

  const basePayload = sanitizePayload(payload);
  let monteCarlo;
  try {
    ({ monteCarlo } = parseMonteCarloPreset(request, basePayload));
  } catch (error) {
    return errorResponse(
      "BAD_REQUEST",
      error instanceof Error ? error.message : "Invalid mc parameter",
      400,
    );
  }
  const responsePayload = {
    ...basePayload,
    includeTrace: false,
    ...(monteCarlo ? { monteCarlo } : {}),
  };

  try {
    const result = await fetchDcfEngine<Record<string, unknown>>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify(responsePayload),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("DCF preview failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse(
      "DCF_ENGINE_ERROR",
      "DCF compute failed",
      status,
    );
  }
}
