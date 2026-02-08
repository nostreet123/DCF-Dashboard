import { randomUUID } from "crypto";
import type { NextResponse } from "next/server.js";

export type DebugLevel = "error" | "standard" | "verbose";

export type DebugContext = {
  correlationId: string;
  debugLevel: DebugLevel;
  startedAtMs: number;
  source: "next_api";
  route: string;
};

const DEBUG_LEVEL_RANK: Record<DebugLevel, number> = {
  error: 0,
  standard: 1,
  verbose: 2,
};

const toDebugLevel = (value: string | undefined | null): DebugLevel | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "error" || normalized === "standard" || normalized === "verbose") {
    return normalized;
  }
  return null;
};

const allowDebugLevelOverride = () => {
  return process.env.ALLOW_DEBUG_LEVEL_OVERRIDE?.trim().toLowerCase() === "true";
};

const defaultDebugLevel = (): DebugLevel => {
  const envLevel = toDebugLevel(process.env.DEBUG_LEVEL_DEFAULT);
  return envLevel ?? "standard";
};

const normalizeCorrelationId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveCorrelationId = (
  request: Request,
  requestIdCandidate: unknown,
): string => {
  const requestId = normalizeCorrelationId(requestIdCandidate);
  if (requestId) {
    return requestId;
  }
  const headerId = normalizeCorrelationId(request.headers.get("x-debug-id"));
  if (headerId) {
    return headerId;
  }
  return randomUUID();
};

const resolveDebugLevel = (request: Request): DebugLevel => {
  if (allowDebugLevelOverride()) {
    const headerLevel = toDebugLevel(request.headers.get("x-debug-level"));
    if (headerLevel) {
      return headerLevel;
    }
  }
  return defaultDebugLevel();
};

export const createDebugContext = (
  request: Request,
  route: string,
  requestIdCandidate?: unknown,
): DebugContext => {
  return {
    correlationId: resolveCorrelationId(request, requestIdCandidate),
    debugLevel: resolveDebugLevel(request),
    startedAtMs: Date.now(),
    source: "next_api",
    route,
  };
};

export const adoptRequestId = (
  context: DebugContext,
  requestIdCandidate: unknown,
): DebugContext => {
  const requestId = normalizeCorrelationId(requestIdCandidate);
  if (!requestId || requestId === context.correlationId) {
    return context;
  }
  return {
    ...context,
    correlationId: requestId,
  };
};

export const shouldEmitDebugEvent = (
  debugLevel: DebugLevel,
  eventLevel: DebugLevel,
): boolean => {
  return DEBUG_LEVEL_RANK[debugLevel] >= DEBUG_LEVEL_RANK[eventLevel];
};

export const withDebugHeaders = (
  response: NextResponse,
  context: DebugContext,
): NextResponse => {
  response.headers.set("x-debug-id", context.correlationId);
  response.headers.set("x-debug-level", context.debugLevel);
  return response;
};
