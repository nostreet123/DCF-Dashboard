import { NextResponse } from "next/server";

import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import { convexClient, getSyncToken } from "@/app/api/_lib/convex";
import { fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import { api } from "@/convex/_generated/api";

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

  const computePayload = {
    ...payload,
    includeTrace: true,
  };

  let result: Record<string, any>;
  try {
    result = await fetchDcfEngine<Record<string, any>>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify(computePayload),
    });
  } catch (error) {
    return errorResponse(
      "DCF_ENGINE_ERROR",
      error instanceof Error ? error.message : "DCF compute failed",
      502,
    );
  }

  try {
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
    };

    await convexClient.mutation(api.valuations.create, {
      syncToken,
      engineVersion: "workbench-v1",
      status: "success",
      error: undefined,
      inputs: payload,
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
    return errorResponse(
      "CONVEX_ERROR",
      error instanceof Error ? error.message : "Convex mutation failed",
      500,
    );
  }

  return NextResponse.json(result);
}
