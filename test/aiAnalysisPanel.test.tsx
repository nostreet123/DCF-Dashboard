/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AiAnalysisPanel } from "../components/workspace/AiAnalysisPanel";

describe("AiAnalysisPanel", () => {
  test("renders the live analysis stream while the model is running", () => {
    const markup = renderToStaticMarkup(
      <AiAnalysisPanel
        status="loading"
        stream={[
          "Packaging current valuation, projections, sensitivity, Monte Carlo, and provenance",
          "Checking approved imports, artifacts, and valuation history from Convex",
        ]}
      />,
    );

    expect(markup).toContain("Model stream");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-label="AI analysis progress"');
    expect(markup).toContain("25%");
    expect(markup).toContain("Packaging current valuation");
    expect(markup).toContain("Waiting for the model response");
  });

  test("starts the loading progress at zero for the first streamed step", () => {
    const markup = renderToStaticMarkup(
      <AiAnalysisPanel
        status="loading"
        stream={[
          "Packaging current valuation, projections, sensitivity, Monte Carlo, and provenance",
        ]}
      />,
    );

    expect(markup).toContain('aria-valuenow="0"');
    expect(markup).toContain('width:0%');
    expect(markup).toContain(">0%</span>");
  });

  test("renders scenario rationales in the workspace panel", () => {
    const markup = renderToStaticMarkup(
      <AiAnalysisPanel
        status="applied"
        rationales={{
          base: "Base scenario rationale.",
          bull: "Bull scenario rationale.",
          bear: "Bear scenario rationale.",
        }}
      />,
    );

    expect(markup).toContain("Scenario rationale");
    expect(markup).toContain("Base scenario rationale.");
    expect(markup).toContain("Bull scenario rationale.");
    expect(markup).toContain("Bear scenario rationale.");
  });

  test("renders AI input token usage without exposing prompt text", () => {
    const markup = renderToStaticMarkup(
      <AiAnalysisPanel
        status="applied"
        rationales={{
          base: "Base scenario rationale.",
        }}
        tokenUsage={{
          inputTokens: 123456,
          estimated: true,
          inputBytes: 1_250_000,
          systemTokens: 900,
          userTokens: 122000,
          messageCount: 2,
          model: "zai-org/GLM-5.1",
          tokenizer: "local-estimate-v1",
        }}
      />,
    );

    expect(markup).toContain("Input tokens");
    expect(markup).toContain("~123,456");
    expect(markup).toContain("Payload");
    expect(markup).toContain("1.2 MB");
    expect(markup).toContain("Estimated");
    expect(markup).not.toContain("Create DCF scenario assumptions");
  });
});
