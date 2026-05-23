import type { Assumptions, Scenario } from "@/lib/workbench/scenarioProfiles";

import { assumptionKeys, readRecord } from "./contracts";

export const formatAssumptionSet = (currentAssumptions: Record<Scenario, Assumptions> | null): string =>
  currentAssumptions
    ? (["base", "bull", "bear"] as const)
        .map((scenario) =>
          `${scenario}: ${assumptionKeys.map((key) => `${key}=${currentAssumptions[scenario][key]}`).join(", ")}`,
        )
        .join("; ")
    : "none supplied";

export const buildModelPayload = (payload: unknown): unknown => {
  const record = readRecord(payload);
  if (!record) {
    return payload;
  }
  const rest = { ...record };
  delete rest.currentAssumptions;
  return {
    ...rest,
    dashboardStateNotes: [
      "currentAssumptions was intentionally withheld from the model evidence packet.",
      "Assumptions must be inferred from company identity, statements, projections, KPIs, sensitivity, Monte Carlo, provenance, imports, Convex context, and reference data.",
      "Engine projections and scenario fair values may have been generated from the current dashboard assumptions. Use them as sensitivity/output context, not as independent evidence to copy back into assumptions.",
      "Do not describe projection-driven growth from the current engine run as historical CAGR or as an independently observed engine CAGR.",
      "When statementTrends is present, prefer it for historical revenue growth and operating margin. KPI percent values may be decimal rates when <= 1, and engine KPI values are model outputs/assumptions unless explicitly marked as historical.",
      "Do not use engine KPI wacc or ebit_margin as justification for selecting a new discount rate or operating margin.",
      "Do not cite exact beta, equity risk premium, risk-free rate, or market-price facts unless those exact fields are present in the payload or convexContext.",
      "Do not cite product cycles, AI catalysts, segment mix, macro conditions, regulatory pressure, or competitive dynamics unless those exact topics are present in the payload or convexContext.",
      "Do not treat generic dashboard defaults as company fundamentals.",
    ],
  };
};

export const AI_SCENARIO_SYSTEM_PROMPT = [
  "You are the valuation co-pilot for a DCF dashboard that uses real company filings, Convex persistence, and a Python DCF engine.",
  "",
  "Your job:",
  "- Produce base, bull, and bear DCF scenario assumptions for the selected company.",
  "- Return exactly one JSON object with keys base, bull, and bear.",
  "- Each scenario object must contain numeric revenueGrowth, operatingMargin, discountRate, terminalGrowth, and a concise rationale string.",
  "- The numeric fields are percentages, not decimals. Example: 7.5 means 7.5%.",
  "",
  "Evidence hierarchy:",
  "1. Prefer explicit live valuation context from the request: company identity, engine outputs, KPIs, statements, projections, sensitivity, Monte Carlo, and provenance.",
  "2. Use convexContext as server-curated database context. It may include companyCache, companyStatementHistory, importedFacts, importArtifacts, recentValuationRuns, latestValuationRunDetail, and referenceDataCatalog.",
  "3. Treat EDGAR/provenance-backed facts and manually approved import facts as stronger evidence than generic prior knowledge.",
  "4. Treat recent valuation run summaries/traces as historical product state, not live market data.",
  "5. If facts conflict, prefer the most recent filing/provenance date and explain the conflict briefly in the rationale.",
  "",
  "Convex context contract:",
  "- companyCache: cached company identity row from Convex companies.",
  "- companyStatementHistory: cached statement facts from Convex companyStatements.",
  "- importedFacts: approved user-reviewed facts persisted in Convex.",
  "- importArtifacts: approved artifact metadata tied to imported facts. Storage ids are references only; you cannot read raw files.",
  "- recentValuationRuns: recent saved valuation run summaries persisted in Convex.",
  "- latestValuationRunDetail: latest saved run with trace included when available.",
  "- referenceDataCatalog: catalog of available reference datasets, not full table rows.",
  "",
  "Scenario construction rules:",
  "- Base should be realistic and anchored to recent fundamentals and engine outputs.",
  "- Bull should be plausibly optimistic, not promotional. It should improve growth and/or margin and usually lower discount rate versus base.",
  "- Bear should be plausibly adverse, not apocalyptic unless the data supports it. It should reduce growth and/or margin and usually raise discount rate versus base.",
  "- Maintain ordering: bull revenueGrowth >= base revenueGrowth >= bear revenueGrowth; bull operatingMargin >= base operatingMargin >= bear operatingMargin; bear discountRate >= base discountRate >= bull discountRate; bull terminalGrowth >= base terminalGrowth >= bear terminalGrowth.",
  "- Terminal growth should stay economically plausible for the company currency/country and mature-company status. Do not exceed long-run nominal growth without a strong data reason.",
  "- Use sensitivity and Monte Carlo context to keep assumptions inside ranges the engine already indicates are important.",
  "- Prefer statementTrends and statementHistory for historical growth and operating margin. Do not cite engine KPI ebit_margin or projected EBIT margin as historical operating margin unless statement facts support it.",
  "- For discount rate rationale, cite only supplied context such as sensitivity, Monte Carlo, currency/country, balance sheet cash/debt, saved run context, or explicit reference data. Do not use engine KPI wacc as evidence for the new WACC, and do not invent beta, ERP, risk-free rates, credit ratings, prices, or market caps.",
  "- Do not cite product launches, AI catalysts, segment mix, macro conditions, regulatory pressure, or competitive dynamics unless supplied context explicitly includes those topics. When only financial statements are supplied, keep rationale anchored to statement trends, profitability, balance sheet, sensitivity, and Monte Carlo.",
  "- Do not cite forecast projections generated from current assumptions as if they were historical realized growth. If you mention them, call them projections or engine outputs.",
  "- Use imported-fact review/provenance quality to temper confidence when data is manually edited, parsed, missing, stale, or uncertain.",
  "- Do not copy generic dashboard defaults. If you see values described as forbidden/current/dashboard values, treat them only as values to avoid echoing, not as evidence.",
  "",
  "Strict output rules:",
  "- Return only JSON. No markdown. No prose outside JSON. No code fences.",
  "- Do not reveal chain-of-thought or private reasoning.",
  "- Do not invent exact facts, filings, metrics, prices, or database rows absent from the supplied context.",
  "- Rationale should cite the provided context at a high level, such as filings, statement trend, sensitivity, Monte Carlo, import review, or prior saved runs.",
  "- Keep rationales useful but compact: one or two sentences per scenario.",
].join("\n");

export const buildPrompt = (
  payload: unknown,
  options: {
    forceDistinct?: boolean;
    currentAssumptions?: Record<Scenario, Assumptions> | null;
    activeScenario?: Scenario | null;
    fastFinal?: boolean;
  } = {},
) => [
  "Create DCF scenario assumptions from the following valuation context.",
  options.fastFinal
    ? "Use concise private reasoning and return the final strict JSON object promptly."
    : "Use maximum private reasoning effort, but obey the system prompt and return only the strict JSON object.",
  options.forceDistinct
    ? `Your previous output did not visibly change the active dashboard scenario (${options.activeScenario ?? "unknown"}). Revise it now using the supplied fundamentals, projections, sensitivity, Monte Carlo, and provenance. Make revenue growth, operating margin, or discount rate in the active scenario materially different; a terminal-growth-only tweak is not enough. Do not return this exact set: ${formatAssumptionSet(options.currentAssumptions ?? null)}. These forbidden current dashboard values are not evidence and must not be cited in rationale or described as KPI values, historical facts, filing facts, projections, or engine-derived assumptions.`
    : "Do not echo generic dashboard defaults. Applying your result should reflect your independent view of the valuation context.",
  "The payload may include convexContext. Treat it as a server-curated, allowlisted Convex database bundle.",
  "convexContext.companyCache means the cached company identity row from Convex.",
  "convexContext.companyStatementHistory means cached annual/company statement facts from Convex.",
  "convexContext.importedFacts means approved user-reviewed facts persisted in Convex.",
  "convexContext.importArtifacts means approved source artifact metadata persisted in Convex file storage.",
  "convexContext.recentValuationRuns means recent saved valuation run summaries persisted in Convex, not live market data.",
  "convexContext.latestValuationRunDetail may include the latest saved valuation trace and normalized inputs.",
  "convexContext.referenceDataCatalog summarizes available Damodaran/reference datasets in Convex.",
  JSON.stringify(buildModelPayload(payload)),
].join("\n\n");

export const buildCompactPrompt = (
  payload: unknown,
  options: {
    forceDistinct?: boolean;
    currentAssumptions?: Record<Scenario, Assumptions> | null;
    activeScenario?: Scenario | null;
  } = {},
) => [
  "Return only a JSON object with base, bull, and bear DCF assumptions.",
  "Each scenario must include revenueGrowth, operatingMargin, discountRate, terminalGrowth, and rationale.",
  "Use percentages, keep values inside the dashboard bounds, and maintain bull/base/bear ordering.",
  "Answer immediately with the final JSON. Do not spend the response budget on hidden reasoning.",
  options.forceDistinct
    ? `The active scenario (${options.activeScenario ?? "unknown"}) must visibly differ in revenue growth, operating margin, or discount rate from these current dashboard values; a terminal-growth-only tweak is not enough: ${formatAssumptionSet(options.currentAssumptions ?? null)}. These values are forbidden dashboard state only; do not cite them as KPI values, historical facts, filing facts, projections, or engine-derived assumptions.`
    : "Do not echo generic dashboard defaults.",
  "Evidence:",
  JSON.stringify(buildModelPayload(payload)),
].join("\n\n");
