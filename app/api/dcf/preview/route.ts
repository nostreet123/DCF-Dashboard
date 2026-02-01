import { NextResponse } from "next/server";

import { BodyLimitError, parseJsonWithLimit } from "@/app/api/_lib/body";
import { fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";

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

  const responsePayload = {
    ...payload,
    includeTrace: false,
  };

  try {
    const result = await fetchDcfEngine<Record<string, unknown>>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify(responsePayload),
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(
      "DCF_ENGINE_ERROR",
      error instanceof Error ? error.message : "DCF compute failed",
      502,
    );
  }
}
