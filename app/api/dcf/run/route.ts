import { NextResponse } from "next/server";

import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  parseMonteCarloPreset,
  sanitizePayload,
} from "@/app/api/_lib/monteCarloPreset";

const noStoreJson = (payload: unknown, init?: ResponseInit) =>
  NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...init?.headers,
    },
  });

export async function POST(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:dcf:run",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_DCF_RUN_PER_MINUTE", 12),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  if (!(await isInternalPersistenceRequest(request))) {
    return errorResponse("UNAUTHORIZED", "Unauthorized", 401);
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
  const computePayload = {
    ...basePayload,
    includeTrace: true,
    ...(monteCarlo ? { monteCarlo } : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DCF engine returns an open-ended JSON object
  let result: Record<string, any>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DCF engine returns an open-ended JSON object
    result = await fetchDcfEngine<Record<string, any>>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify(computePayload),
    });
  } catch (error) {
    console.error("DCF run failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse(
      "DCF_ENGINE_ERROR",
      "DCF compute failed",
      status,
    );
  }

  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Valuation persistence backend is not configured",
      503,
    );
  }

  try {
    const requestId =
      typeof payload.requestId === "string" ? payload.requestId : undefined;
    const symbol = typeof payload.symbol === "string" ? payload.symbol : undefined;
    const primaryKeyNorm =
      typeof payload.primaryKeyNorm === "string" ? payload.primaryKeyNorm : undefined;
    const regionCode =
      typeof payload.regionCode === "string" ? payload.regionCode : undefined;
    const asOfDate =
      typeof payload.asOfDate === "string" ? payload.asOfDate : undefined;

    const trace = result;
    const traceByteSize = Buffer.byteLength(JSON.stringify(trace));
    const resultSummary = {
      base: result.base?.valuation,
      bull: result.bull?.valuation,
      bear: result.bear?.valuation,
      kpis: result.kpis,
      monteCarlo: result.monteCarlo,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    const createValuation = "valuations:create" as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids deep Convex type instantiation
    await (convexClient as any).mutation(createValuation, {
      syncToken,
      engineVersion: "workbench-v1",
      status: "success",
      error: undefined,
      inputs: basePayload,
      normalizedInputs: undefined,
      provenance: undefined,
      resultSummary,
      primaryKeyNorm,
      regionCode,
      asOfDate,
      traceStorage: "inline",
      trace,
      traceByteSize,
      requestId,
      symbol,
    });
  } catch (error) {
    console.error("Valuation persistence failed", error);
    return errorResponse(
      "PERSISTENCE_ERROR",
      "Valuation persistence failed",
      502,
    );
  }

  return noStoreJson(result);
}
