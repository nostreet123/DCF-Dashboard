/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { buildTraceRefClearPatch } from "../convex/maintenance/pruning.logic";

describe("maintenance pruning trace ref patch", () => {
  test("returns patch when run still points to the pruned external trace", () => {
    const patch = buildTraceRefClearPatch(
      {
        traceStorage: "external",
        traceId: "trace_1" as any,
      },
      "trace_1" as any,
    );
    expect(patch).toEqual({
      traceId: undefined,
      traceStorage: "none",
    });
  });

  test("returns null when run does not exist", () => {
    expect(buildTraceRefClearPatch(null, "trace_1" as any)).toBeNull();
  });

  test("returns null when run no longer uses external trace storage", () => {
    const patch = buildTraceRefClearPatch(
      {
        traceStorage: "inline",
        traceId: "trace_1" as any,
      },
      "trace_1" as any,
    );
    expect(patch).toBeNull();
  });

  test("returns null when run points to a different trace id", () => {
    const patch = buildTraceRefClearPatch(
      {
        traceStorage: "external",
        traceId: "trace_2" as any,
      },
      "trace_1" as any,
    );
    expect(patch).toBeNull();
  });
});

