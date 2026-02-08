import { NextResponse } from "next/server.js";

import {
  adoptRequestId,
  createDebugContext,
  withDebugHeaders,
} from "../../_lib/debugContext";
import { getSyncToken, mutateConvex } from "../../_lib/convex";
import { DcfRequestError, prepareDcfRequest } from "../../_lib/dcfRequest";
import { fetchDcfEngine } from "../../_lib/dcfEngine";
import { mapDcfEngineError } from "../../_lib/dcfEngineErrors";
import { appendDebugEvent } from "../../_lib/debugEvents";
import { errorResponse } from "../../_lib/errors";
import { sanitizeDebugInputs } from "../../_lib/debugSanitizer";

type DcfComputeResult = Record<string, unknown> & {
  base?: { valuation?: unknown };
  bull?: { valuation?: unknown };
  bear?: { valuation?: unknown };
  kpis?: unknown;
  monteCarlo?: unknown;
};

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  let debug = createDebugContext(request, "/api/dcf/run");

  let payload: Record<string, unknown>;
  let basePayload: Record<string, unknown>;
  let computePayload: Record<string, unknown>;
  try {
    ({ payload, basePayload, computePayload } = await prepareDcfRequest(request, true));
    debug = adoptRequestId(debug, payload.requestId);
    await appendDebugEvent({
      context: debug,
      eventType: "request.received",
      data: { route: "/api/dcf/run" },
    });
    await appendDebugEvent({
      context: debug,
      eventType: "request.validated",
      level: "verbose",
      data: sanitizeDebugInputs(basePayload),
    });
  } catch (error) {
    await appendDebugEvent({
      context: debug,
      eventType: "request.invalid",
      level: "error",
      message: error instanceof Error ? error.message : "Invalid request",
      data: { code: "BAD_REQUEST" },
    });
    if (error instanceof DcfRequestError) {
      return errorResponse(error.code, error.message, error.status, debug);
    }
    return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400, debug);
  }

  let result: DcfComputeResult;
  const engineStartedAt = Date.now();
  try {
    await appendDebugEvent({
      context: debug,
      eventType: "engine.called",
      level: "verbose",
    });
    result = await fetchDcfEngine<DcfComputeResult>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify(computePayload),
      correlationId: debug.correlationId,
      debugLevel: debug.debugLevel,
    });
  } catch (error) {
    const mappedError = mapDcfEngineError(error, "DCF compute failed");
    await appendDebugEvent({
      context: debug,
      eventType: mappedError.status === 400 ? "engine.rejected" : "engine.failed",
      level: mappedError.status === 400 ? "standard" : "error",
      message: mappedError.message,
      data: {
        code: mappedError.code,
        upstreamStatus: mappedError.upstreamStatus,
        engineDurationMs: Date.now() - engineStartedAt,
      },
    });
    return errorResponse(mappedError.code, mappedError.message, mappedError.status, debug);
  }
  const engineDurationMs = Date.now() - engineStartedAt;

  try {
    const persistStartedAt = Date.now();
    const syncToken = getSyncToken();
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

    const run = await mutateConvex<{ runId: string; traceId?: string }>("valuations:create", {
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
      correlationId: debug.correlationId,
      debugLevel: debug.debugLevel,
      debugSummary: {
        route: "/api/dcf/run",
        totalDurationMs: Date.now() - requestStartedAt,
        engineDurationMs,
        persistDurationMs: Date.now() - persistStartedAt,
        traceByteSize,
        traceStorage: "inline",
        resultSections: Object.keys(resultSummary),
      },
    });
    await appendDebugEvent({
      context: debug,
      eventType: "convex.persist.success",
      level: "standard",
      data: {
        runId: run.runId,
        traceByteSize,
        traceStorage: "inline",
        totalDurationMs: Date.now() - requestStartedAt,
      },
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message.includes("DAMODARAN_SYNC_TOKEN is required")
        ? "CONFIG_ERROR"
        : "CONVEX_ERROR";
    await appendDebugEvent({
      context: debug,
      eventType: "convex.persist.failed",
      level: "error",
      message: error instanceof Error ? error.message : "Convex mutation failed",
      data: { code },
    });
    return errorResponse(
      code,
      error instanceof Error ? error.message : "Convex mutation failed",
      500,
      debug,
    );
  }

  await appendDebugEvent({
    context: debug,
    eventType: "request.completed",
    level: "standard",
    data: {
      status: "success",
      totalDurationMs: Date.now() - requestStartedAt,
      engineDurationMs,
    },
  });
  return withDebugHeaders(NextResponse.json(result), debug);
}
