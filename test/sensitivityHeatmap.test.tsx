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
});
