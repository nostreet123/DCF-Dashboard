/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RightPanel } from "../components/layout/RightPanel";

describe("RightPanel", () => {
  test("updates range drivers from active scenario assumptions", () => {
    const markup = renderToStaticMarkup(
      <RightPanel
        scenario="base"
        assumptions={{
          revenueGrowth: 10,
          operatingMargin: 24,
          discountRate: 10.5,
          terminalGrowth: 2.5,
        }}
      />,
    );

    expect(markup).toContain("Revenue Growth");
    expect(markup).toContain("Operating Margin");
    expect(markup).toContain("Discount Rate");
    expect(markup).toContain("Terminal Growth");
    expect(markup).toContain("medium");
    expect(markup).toContain('aria-label="Negative impact"');
    expect(markup).toContain('aria-label="Positive impact"');
  });

  test("keeps long AI rationale out of the docked assumptions panel", () => {
    const markup = renderToStaticMarkup(
      <RightPanel
        onApplyAiAnalysis={() => undefined}
        aiAnalysisStatus="applied"
      />,
    );

    expect(markup).toContain("Apply AI Analysis");
    expect(markup).not.toContain("Base scenario rationale");
  });
});
