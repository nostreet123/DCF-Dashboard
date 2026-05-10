/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { shouldScheduleCleanupChunk } from "../convex/maintenance/duplicateCleanup.logic";

describe("duplicateCleanup.logic", () => {
  test("schedules only while running", () => {
    expect(shouldScheduleCleanupChunk("running")).toBeTrue();
    expect(shouldScheduleCleanupChunk("complete")).toBeFalse();
    expect(shouldScheduleCleanupChunk("error")).toBeFalse();
    expect(shouldScheduleCleanupChunk(undefined)).toBeFalse();
  });
});
