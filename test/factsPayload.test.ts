import { describe, expect, test } from "bun:test";

import { buildWorkbenchPayloadFromFacts } from "../lib/workbench/factsPayload";

const assumptions = {
  base: {
    revenueGrowth: 12,
    operatingMargin: 25,
    discountRate: 10,
    terminalGrowth: 2.5,
  },
  bull: {
    revenueGrowth: 18,
    operatingMargin: 30,
    discountRate: 8,
    terminalGrowth: 3,
  },
  bear: {
    revenueGrowth: 6,
    operatingMargin: 18,
    discountRate: 14,
    terminalGrowth: 2,
  },
};

describe("buildWorkbenchPayloadFromFacts", () => {
  test("defaults missing optional balance bridge fields to zero", () => {
    const payload = buildWorkbenchPayloadFromFacts(
      { symbol: "BRK-A", scenario: "base", assumptions },
      {
        symbol: "BRK-A",
        currency: "USD",
        statements: [
          {
            period_end: "2025-12-31",
            period_type: "FY",
            revenue: 1000,
            cash: null,
            debt: null,
            shares_outstanding: 100,
          },
        ],
      },
    );

    expect(payload.cash).toBe(0);
    expect(payload.debt).toBe(0);
    expect(payload.scenario).toBe("base");
    expect(payload.sharesOutstanding).toBe(100);
  });

  test("passes the active scenario through to the workbench engine", () => {
    const payload = buildWorkbenchPayloadFromFacts(
      { symbol: "BRK-A", scenario: "bull", assumptions },
      {
        symbol: "BRK-A",
        currency: "USD",
        statements: [
          {
            period_end: "2025-12-31",
            period_type: "FY",
            revenue: 1000,
            cash: 10,
            debt: 0,
            shares_outstanding: 100,
          },
        ],
      },
    );

    expect(payload.scenario).toBe("bull");
  });

  test("always uses the newest annual statement for valuation inputs", () => {
    const payload = buildWorkbenchPayloadFromFacts(
      { symbol: "AAPL", scenario: "base", assumptions },
      {
        symbol: "AAPL",
        currency: "USD",
        statements: [
          {
            period_end: "2023-09-30",
            period_type: "FY",
            revenue: 383_285_000_000,
            cash: 29_965_000_000,
            debt: 95_281_000_000,
            shares_outstanding: 15_550_061_000,
          },
          {
            period_end: "2025-09-27",
            period_type: "FY",
            revenue: 416_161_000_000,
            operating_income: 133_050_000_000,
            operating_margin: 0.319704,
            cash: 35_934_000_000,
            debt: 78_328_000_000,
            shares_outstanding: 14_773_260_000,
          },
          {
            period_end: "2024-09-28",
            period_type: "FY",
            revenue: 391_035_000_000,
            cash: 29_943_000_000,
            debt: 85_750_000_000,
            shares_outstanding: 15_116_786_000,
          },
        ],
      },
    );

    expect(payload.baseYear).toBe(2025);
    expect(payload.revenueT0).toBe(416_161_000_000);
    expect(payload.sharesOutstanding).toBe(14_773_260_000);
    expect(payload.statements.map((statement) => statement.periodEnd)).toEqual([
      "2025-09-27",
      "2024-09-28",
      "2023-09-30",
    ]);
    expect(payload.statements[0]).toMatchObject({
      operatingIncome: 133_050_000_000,
      operatingMargin: 0.319704,
    });
  });

  test("fails instead of silently falling back when the newest annual statement is incomplete", () => {
    expect(() =>
      buildWorkbenchPayloadFromFacts(
        { symbol: "AAPL", scenario: "base", assumptions },
        {
          symbol: "AAPL",
          statements: [
            {
              period_end: "2025-09-27",
              period_type: "FY",
              revenue: null,
              cash: 35_934_000_000,
              debt: 78_328_000_000,
              shares_outstanding: 14_773_260_000,
            },
            {
              period_end: "2024-09-28",
              period_type: "FY",
              revenue: 391_035_000_000,
              cash: 29_943_000_000,
              debt: 85_750_000_000,
              shares_outstanding: 15_116_786_000,
            },
          ],
        },
      ),
    ).toThrow("AAPL latest annual statement is missing revenue");
  });

  test("still requires shares outstanding", () => {
    expect(() =>
      buildWorkbenchPayloadFromFacts(
        { symbol: "BRK-A", scenario: "base", assumptions },
        {
          symbol: "BRK-A",
          statements: [
            {
              period_end: "2025-12-31",
              period_type: "FY",
              revenue: 1000,
              cash: 10,
              debt: 0,
            },
          ],
        },
      ),
    ).toThrow("BRK-A latest annual statement is missing sharesOutstanding");
  });
});
