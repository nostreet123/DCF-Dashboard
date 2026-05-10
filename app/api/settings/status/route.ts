import { NextResponse } from "next/server";

import { isAdminModeConfigured } from "@/app/api/_lib/adminMode";
import { getConvexClient, getSyncTokenOptional } from "@/app/api/_lib/convex";
import {
  enforceRateLimit,
  getRateLimitPerMinute,
  rateLimitErrorResponse,
} from "@/app/api/_lib/rateLimit";
import { getDashboardDataMode } from "@/lib/dashboardDataMode";

export async function GET(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    key: "api:settings:status",
    limit: getRateLimitPerMinute("API_RATE_LIMIT_SETTINGS_STATUS_PER_MINUTE", 60),
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  return NextResponse.json({
    secUserAgent: {
      configured: Boolean(process.env.SEC_USER_AGENT),
    },
    ai: {
      configured: Boolean(process.env.HUGGING_FACE_API_KEY && process.env.HUGGING_FACE_MODEL),
      model: process.env.HUGGING_FACE_MODEL ?? null,
      adminModeAvailable: isAdminModeConfigured(),
    },
    convex: {
      configured: Boolean(getConvexClient()),
      syncTokenConfigured: Boolean(getSyncTokenOptional()),
      historyReady: Boolean(getConvexClient()),
      importsReady: Boolean(getConvexClient() && getSyncTokenOptional()),
    },
    dataMode: getDashboardDataMode(),
  });
}
