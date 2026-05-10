/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import type { Id } from "../convex/_generated/dataModel";
import {
  normalizeLimit,
  pickBestSnapshot,
} from "../convex/snapshots_helpers";

const snapshotId = (value: string) => value as unknown as Id<"snapshots">;

describe("normalizeLimit", () => {
  test("returns default when undefined", () => {
    expect(normalizeLimit(undefined, 10, 100)).toBe(10);
  });

  test("clamps values above max", () => {
    expect(normalizeLimit(999, 10, 100)).toBe(100);
  });

  test("throws on invalid input", () => {
    expect(() => normalizeLimit(0, 10, 100)).toThrow();
    expect(() => normalizeLimit(1.5, 10, 100)).toThrow();
  });
});

describe("pickBestSnapshot", () => {
  test("prefers active build", () => {
    const best = pickBestSnapshot([
      {
        _id: snapshotId("s1"),
        activeBuildId: undefined,
        pendingBuildId: undefined,
        downloadedAt: 100,
        parsedAt: 100,
        _creationTime: 100,
      },
      {
        _id: snapshotId("s2"),
        activeBuildId: "b1",
        pendingBuildId: undefined,
        downloadedAt: 1,
        parsedAt: 1,
        _creationTime: 1,
      },
    ]);
    expect(best?._id).toBe(snapshotId("s2"));
  });

  test("falls back to newest by parsed/downloaded/creation", () => {
    const best = pickBestSnapshot([
      {
        _id: snapshotId("s1"),
        activeBuildId: undefined,
        pendingBuildId: "p1",
        downloadedAt: 10,
        parsedAt: 10,
        _creationTime: 10,
      },
      {
        _id: snapshotId("s2"),
        activeBuildId: undefined,
        pendingBuildId: "p1",
        downloadedAt: 20,
        parsedAt: 20,
        _creationTime: 20,
      },
    ]);
    expect(best?._id).toBe(snapshotId("s2"));
  });
});
