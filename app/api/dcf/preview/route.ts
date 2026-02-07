import { NextResponse } from "next/server";

import { DcfRequestError, prepareDcfRequest } from "@/app/api/_lib/dcfRequest";
import { fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";

export async function POST(request: Request) {
  let computePayload: Record<string, unknown>;
  try {
    ({ computePayload } = await prepareDcfRequest(request, false));
  } catch (error) {
    if (error instanceof DcfRequestError) {
      return errorResponse(error.code, error.message, error.status);
    }
    return errorResponse("BAD_REQUEST", "Invalid JSON payload", 400);
  }

  try {
    const result = await fetchDcfEngine<Record<string, unknown>>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify(computePayload),
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
