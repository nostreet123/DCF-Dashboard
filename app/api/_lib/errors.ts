import { NextResponse } from "next/server.js";
import { DebugContext, withDebugHeaders } from "./debugContext";

export const errorResponse = (
  code: string,
  message: string,
  status: number = 400,
  context?: DebugContext,
) => {
  const body = context
    ? { code, message, correlationId: context.correlationId }
    : { code, message };
  const response = NextResponse.json(body, { status });
  return context ? withDebugHeaders(response, context) : response;
};
