import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "bun:test";

describe("metrics:getCounts implementation", () => {
  it("does not use paginated queries", () => {
    const source = readFileSync(resolve("convex/metrics.ts"), "utf8");
    expect(source.includes(".paginate(")).toBe(false);
  });
});
