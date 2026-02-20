import type { Doc, Id } from "../_generated/dataModel";

type RunTraceRef = Pick<Doc<"valuationRuns">, "traceId" | "traceStorage">;

export const buildTraceRefClearPatch = (
  run: RunTraceRef | null,
  traceId: Id<"valuationRunTraces">,
) => {
  if (!run) {
    return null;
  }
  if (run.traceStorage !== "external") {
    return null;
  }
  if (run.traceId !== traceId) {
    return null;
  }
  return {
    traceId: undefined,
    traceStorage: "none" as const,
  };
};

