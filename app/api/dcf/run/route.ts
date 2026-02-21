import { NextResponse } from "next/server";

import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { isInternalPersistenceRequest } from "@/app/api/_lib/internalAuth";
import {
  parseMonteCarloPreset,
  sanitizePayload,
} from "@/app/api/_lib/monteCarloPreset";

export async function POST(request: Request) {
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

  let result: Record<string, any>;
  try {
    result = await fetchDcfEngine<Record<string, any>>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify(computePayload),
    });
  } catch (error) {
    console.error("DCF run failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse(
      "DCF_ENGINE_ERROR",
      error instanceof Error ? error.message : "DCF compute failed",
      status,
    );
  }

  if (!isInternalPersistenceRequest(request)) {
    console.warn("Skipping valuation persistence: request is not authorized");
    return NextResponse.json(result);
  }

  const convexClient = getConvexClient();
  const syncToken = getSyncTokenOptional();
  if (!convexClient || !syncToken) {
    if (!convexClient) {
      console.warn("Skipping valuation persistence: CONVEX_URL is not configured");
    } else {
      console.warn("Skipping valuation persistence: DAMODARAN_SYNC_TOKEN is not configured");
    }
    return NextResponse.json(result);
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

    const createValuation = "valuations:create" as any;
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
    console.warn("Valuation persistence failed", error);
  }

  return NextResponse.json(result);
}
