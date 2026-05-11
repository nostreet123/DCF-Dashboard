/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ValueCard } from "../components/workspace/ValueCard";

describe("ValueCard", () => {
  test("renders current active assumptions in the hero chips", () => {
    const markup = renderToStaticMarkup(
      <ValueCard
        value={23.79}
        scenario="base"
        ticker="AAPL"
        assumptions={{
          revenueGrowth: 10,
          operatingMargin: 24,
          discountRate: 10.5,
          terminalGrowth: 2.5,
        }}
      />,
    );

    expect(markup).toContain("Growth");
    expect(markup).toContain("10%");
    expect(markup).toContain("Margin");
    expect(markup).toContain("24%");
    expect(markup).toContain("WACC");
    expect(markup).toContain("10.5%");
    expect(markup).not.toContain("12%");
    expect(markup).not.toContain("25%");
  });

  test("labels Monte Carlo range and histogram axes explicitly", () => {
    const markup = renderToStaticMarkup(
      <ValueCard
        value={32.96}
        scenario="base"
        ticker="AAPL"
        range={[13.83, 29.76]}
        histogram={{
          binCenters: [5.93, 20, 58.04],
          density: [0.1, 1, 0.2],
        }}
      />,
    );

    expect(markup).toContain("MC P10-P90");
    expect(markup).toContain("Histogram min/max");
    expect(markup).toContain("$13.83");
    expect(markup).toContain("$29.76");
    expect(markup).toContain("MC P10-P90 range");
  });

  test("shows a recomputing state when scenario output is stale", () => {
    const markup = renderToStaticMarkup(
      <ValueCard
        value={32.96}
        scenario="bull"
        ticker="AAPL"
        isCalculating
      />,
    );

    expect(markup).toContain("Recalculating scenario...");
  });
});
