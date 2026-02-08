import { NextResponse } from "next/server.js";

import {
  adoptRequestId,
  createDebugContext,
  withDebugHeaders,
} from "../../_lib/debugContext";
import { DcfRequestError, prepareDcfRequest } from "../../_lib/dcfRequest";
import { fetchDcfEngine } from "../../_lib/dcfEngine";
import { mapDcfEngineError } from "../../_lib/dcfEngineErrors";
import { appendDebugEvent } from "../../_lib/debugEvents";
import { errorResponse } from "../../_lib/errors";
import { sanitizeDebugInputs } from "../../_lib/debugSanitizer";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let debug = createDebugContext(request, "/api/dcf/preview");

  let computePayload: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    ({ payload, computePayload } = await prepareDcfRequest(request, false));
    debug = adoptRequestId(debug, payload.requestId);
    await appendDebugEvent({
      context: debug,
      eventType: "request.received",
      level: "verbose",
      data: { route: "/api/dcf/preview" },
    });
    await appendDebugEvent({
      context: debug,
      eventType: "request.validated",
      level: "verbose",
      data: sanitizeDebugInputs(payload),
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

  try {
    await appendDebugEvent({
      context: debug,
      eventType: "engine.called",
      level: "verbose",
    });
    const result = await fetchDcfEngine<Record<string, unknown>>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify(computePayload),
      correlationId: debug.correlationId,
      debugLevel: debug.debugLevel,
    });
    await appendDebugEvent({
      context: debug,
      eventType: "request.completed",
      level: "standard",
      data: { status: "success", totalDurationMs: Date.now() - startedAt },
    });
    return withDebugHeaders(NextResponse.json(result), debug);
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
        totalDurationMs: Date.now() - startedAt,
      },
    });
    return errorResponse(mappedError.code, mappedError.message, mappedError.status, debug);
  }
}
