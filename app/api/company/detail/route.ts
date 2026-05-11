import { NextResponse } from "next/server";

import { DcfEngineHttpError, fetchDcfEngine } from "@/app/api/_lib/dcfEngine";
import { errorResponse } from "@/app/api/_lib/errors";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";

export async function GET(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:company:detail",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_COMPANY_DETAIL_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return errorResponse("BAD_REQUEST", "Missing id parameter", 400);
  }

  if (!process.env.DCF_ENGINE_URL) {
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Company detail backend is not configured",
      503,
    );
  }

  try {
    const detail = await fetchDcfEngine<Record<string, unknown>>(
      `/company/detail?id=${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    return NextResponse.json(detail);
  } catch (error) {
    console.error("Company detail failed", error);
    const status = error instanceof DcfEngineHttpError ? error.status : 502;
    return errorResponse(
      "COMPANY_DETAIL_ERROR",
      "Company detail failed",
      status,
    );
  }
}
