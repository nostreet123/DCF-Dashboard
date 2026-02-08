import { getSyncToken, mutateConvex } from "./convex";
import {
  DebugContext,
  DebugLevel,
  shouldEmitDebugEvent,
} from "./debugContext";
import { sanitizeDebugEventData } from "./debugSanitizer";

type AppendDebugEventArgs = {
  context: DebugContext;
  eventType: string;
  level?: DebugLevel;
  message?: string;
  data?: Record<string, unknown>;
};

export const appendDebugEvent = async ({
  context,
  eventType,
  level = "standard",
  message,
  data,
}: AppendDebugEventArgs): Promise<void> => {
  if (!shouldEmitDebugEvent(context.debugLevel, level)) {
    return;
  }
  let syncToken: string;
  try {
    syncToken = getSyncToken();
  } catch {
    return;
  }

  try {
    await mutateConvex<unknown>("debugEvents:append", {
      syncToken,
      correlationId: context.correlationId,
      source: context.source,
      route: context.route,
      level,
      debugLevel: context.debugLevel,
      eventType,
      message,
      data: sanitizeDebugEventData(data),
    });
  } catch {
    // Best-effort only; debug writes should never block request handling.
  }
};
