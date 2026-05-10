/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SensitivityHeatmap } from "../components/charts/SensitivityHeatmap";
import { ThemeProvider } from "../lib/contexts/ThemeContext";

describe("SensitivityHeatmap", () => {
  test("renders responsive SVG sizing without an invalid auto height attribute", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider>
        <SensitivityHeatmap
          data={[
            [100, 110],
            [120, 130],
          ]}
          growthOffsets={[-1, 0]}
          waccOffsets={[0, 1]}
        />
      </ThemeProvider>,
    );

    expect(markup).toContain('width="100%"');
    expect(markup).not.toContain('height="auto"');
  });

  test("uses compact cell labels for high-priced shares", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider>
        <SensitivityHeatmap
          data={[
            [655433.29, 985041.19],
            [1170998.74, 1020000],
          ]}
          growthOffsets={[-1, 0]}
          waccOffsets={[0, 1]}
        />
      </ThemeProvider>,
    );

    expect(markup).toContain("$985K");
    expect(markup).not.toContain("$985,041.19");
  });

  test("renders actual growth and WACC rates when active assumptions are provided", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider>
        <SensitivityHeatmap
          data={[
            [100, 110],
            [90, 100],
          ]}
          growthOffsets={[-1, 0]}
          waccOffsets={[0, 1]}
          baseGrowthRate={5}
          baseWaccRate={9}
        />
      </ThemeProvider>,
    );

    expect(markup).toContain("4%");
    expect(markup).toContain("5%");
    expect(markup).toContain("9%");
    expect(markup).toContain("10%");
    expect(markup).toContain("Growth 5%, WACC 9%: $110.00");
    expect(markup).not.toContain("+1%");
  });
});
