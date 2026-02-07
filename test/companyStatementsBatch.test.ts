import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dedupeStatements } from "../convex/companyStatementsBatch.ts";

describe("dedupeStatements", () => {
  it("keeps different period types for the same period end", () => {
    const statements = dedupeStatements([
      { periodEnd: "2024-12-31", periodType: "FY", source: "edgar" },
      { periodEnd: "2024-12-31", periodType: "TTM", source: "edgar" },
    ]);
    assert.equal(statements.length, 2);
  });

  it("keeps the last duplicate for the same key", () => {
    const statements = dedupeStatements([
      {
        periodEnd: "2024-12-31",
        periodType: "FY",
        source: "edgar",
        revenue: 100,
      },
      {
        periodEnd: "2024-12-31",
        periodType: "FY",
        source: "edgar",
        revenue: 200,
      },
    ]);

    assert.equal(statements.length, 1);
    assert.equal(statements[0].revenue, 200);
  });
});
