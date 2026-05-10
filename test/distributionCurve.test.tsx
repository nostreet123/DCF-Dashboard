/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DistributionCurve } from "../components/charts/DistributionCurve";

describe("DistributionCurve", () => {
  test("renders the distribution as the smooth area design", () => {
    const markup = renderToStaticMarkup(
      <DistributionCurve
        histogram={{
          binCenters: [100, 110, 120],
          density: [0.5, 1, 0.25],
        }}
        currentValue={105}
      />,
    );

    expect(markup).toContain("<path");
    expect(markup).not.toContain("MC P10-P90 range");
  });

  test("keeps the current value marker inside the distribution curve", () => {
    const markup = renderToStaticMarkup(
      <DistributionCurve
        histogram={{
          binCenters: [100, 110, 120],
          density: [0.25, 1, 0.25],
        }}
        currentValue={105}
        width={280}
        height={100}
      />,
    );

    expect(markup).toContain('y1="34.375"');
    expect(markup).toContain('cy="34.375"');
    expect(markup).not.toContain('<line x1="80" y1="10"');
  });

  test("clamps the current value marker when value is outside the histogram range", () => {
    const markup = renderToStaticMarkup(
      <DistributionCurve
        histogram={{
          binCenters: [100, 110, 120],
          density: [0.25, 1, 0.25],
        }}
        currentValue={140}
        width={280}
        height={100}
      />,
    );

    expect(markup).toContain('x1="260"');
    expect(markup).toContain('cx="260"');
    expect(markup).toContain("FV &gt; range");
    expect(markup).not.toContain('cy="75"');
  });

  test("renders an optional P10-P90 band inside the histogram domain", () => {
    const markup = renderToStaticMarkup(
      <DistributionCurve
        histogram={{
          binCenters: [100, 110, 120],
          density: [0.25, 1, 0.25],
        }}
        currentValue={110}
        p10={105}
        p90={115}
        width={280}
        height={100}
      />,
    );

    expect(markup).toContain("MC P10-P90 range");
    expect(markup).toContain("<rect");
    expect(markup).toContain('stroke-dasharray="2 3"');
  });
});
