import { describe, expect, test } from "bun:test";

describe("route module imports", () => {
  test("imports API route handlers under Bun test runner", async () => {
    const preview = await import("../app/api/dcf/preview/route.ts");
    const run = await import("../app/api/dcf/run/route.ts");
    const search = await import("../app/api/company/search/route.ts");
    const facts = await import("../app/api/company/facts/route.ts");

    expect(typeof preview.POST).toBe("function");
    expect(typeof run.POST).toBe("function");
    expect(typeof search.GET).toBe("function");
    expect(typeof facts.GET).toBe("function");
  });
});
