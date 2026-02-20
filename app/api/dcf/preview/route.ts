import { NextResponse } from "next/server";

import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import { fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
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
    return errorResponse("DCF_ENGINE_ERROR", "DCF compute failed", 502);
  }
}
