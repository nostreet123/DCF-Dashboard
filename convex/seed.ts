import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const SEED_CATEGORIES = [
  {
    slug: "corporate_governance",
    name: "Corporate Governance",
    description: "Ownership and governance data by industry.",
    sortOrder: 1,
  },
  {
    slug: "risk_discount_rate",
    name: "Risk / Discount Rate",
    description: "Risk premiums, betas, costs of capital, and related inputs.",
    sortOrder: 2,
  },
  {
    slug: "investment_returns",
    name: "Investment Returns",
    description: "Return measures and market value summaries by industry.",
    sortOrder: 3,
  },
  {
    slug: "capital_structure",
    name: "Capital Structure",
    description: "Debt structure, ratings, and financing inputs.",
    sortOrder: 4,
  },
  {
    slug: "dividend_policy",
    name: "Dividend Policy",
    description: "Dividend payout and related trade-off measures.",
    sortOrder: 5,
  },
  {
    slug: "cash_flows",
    name: "Cash Flows",
    description: "Reinvestment, margins, working capital, and financing flows.",
    sortOrder: 6,
  },
  {
    slug: "growth_reinvestment",
    name: "Growth / Reinvestment",
    description: "Growth rates derived from fundamentals and history.",
    sortOrder: 7,
  },
  {
    slug: "multiples",
    name: "Multiples",
    description: "Valuation multiples and related fundamentals.",
    sortOrder: 8,
  },
  {
    slug: "option",
    name: "Option",
    description: "Inputs for option pricing models.",
    sortOrder: 9,
  },
  {
    slug: "unknown",
    name: "Unknown",
    description: "Fallback for unmapped datasets.",
    sortOrder: 999,
  },
];

const SEED_REGIONS = [
  {
    code: "us",
    name: "United States",
    fileTokens: ["us", "usa"],
    sortOrder: 1,
  },
  {
    code: "europe",
    name: "Europe",
    fileTokens: ["europe", "eu"],
    sortOrder: 2,
  },
  {
    code: "japan",
    name: "Japan",
    fileTokens: ["japan", "jp"],
    sortOrder: 3,
  },
  {
    code: "ausnzcan",
    name: "Australia / New Zealand / Canada",
    fileTokens: ["australia", "aus", "newzealand", "nz", "canada", "can", "rest"],
    sortOrder: 4,
  },
  {
    code: "emerging",
    name: "Emerging Markets",
    fileTokens: ["emerg", "emerging", "emergingmarkets"],
    sortOrder: 5,
  },
  {
    code: "china",
    name: "China",
    fileTokens: ["china"],
    sortOrder: 6,
  },
  {
    code: "india",
    name: "India",
    fileTokens: ["india"],
    sortOrder: 7,
  },
  {
    code: "global",
    name: "Global",
    fileTokens: ["global", "world", "intl", "international"],
    sortOrder: 8,
  },
  {
    code: "unknown",
    name: "Unknown",
    fileTokens: [],
    sortOrder: 999,
  },
];

const SEED_DATASETS = [
  {
    key: "inshold",
    name: "Insider and Institutional Holdings",
    description: "Insider and institutional holdings by industry sector.",
    categorySlug: "corporate_governance",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "histretsp",
    name: "Historical Returns (US)",
    description: "Historical returns on stocks, bonds, bills, and real estate.",
    categorySlug: "risk_discount_rate",
    dataType: "timeseries",
    defaultRegionCode: "us",
  },
  {
    key: "histimpl",
    name: "Implied Equity Risk Premium (US)",
    description: "Implied equity risk premium time series for the US.",
    categorySlug: "risk_discount_rate",
    dataType: "timeseries",
    defaultRegionCode: "us",
  },
  {
    key: "ctryprem",
    name: "Country Risk Premiums",
    description: "Country risk premiums based on ratings and CDS spreads.",
    categorySlug: "risk_discount_rate",
    dataType: "country",
    defaultRegionCode: "global",
  },
  {
    key: "betas",
    name: "Levered and Unlevered Betas",
    description: "Levered, unlevered, and pure play betas by industry.",
    categorySlug: "risk_discount_rate",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "countrytaxrates",
    name: "Marginal Tax Rate by Country",
    description: "Corporate marginal tax rates by country.",
    categorySlug: "risk_discount_rate",
    dataType: "country",
    defaultRegionCode: "global",
  },
  {
    key: "totalbeta",
    name: "Total Beta",
    description: "Total betas by industry sector.",
    categorySlug: "risk_discount_rate",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "mktcaprisk",
    name: "Risk Measures by Market Cap Class",
    description: "Risk measures for US firms by market cap class.",
    categorySlug: "risk_discount_rate",
    dataType: "other",
    defaultRegionCode: "us",
  },
  {
    key: "wacc",
    name: "Cost of Capital",
    description: "Cost of capital by industry sector.",
    categorySlug: "risk_discount_rate",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "taxrate",
    name: "Tax Rate by Industry",
    description: "Average effective tax rate by industry.",
    categorySlug: "risk_discount_rate",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "dollar",
    name: "Dollar Value Measures",
    description: "Aggregated dollar values by industry.",
    categorySlug: "investment_returns",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "mktcap",
    name: "Market Capitalization",
    description: "Market capitalization and enterprise value by industry.",
    categorySlug: "investment_returns",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "employee",
    name: "Employee Statistics",
    description: "Employee and revenue statistics by industry.",
    categorySlug: "investment_returns",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "eva",
    name: "EVA and Equity EVA",
    description: "Excess returns by industry sector.",
    categorySlug: "investment_returns",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "debtdetails",
    name: "Debt Details",
    description: "Debt composition by industry sector.",
    categorySlug: "capital_structure",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "dbtfund",
    name: "Debt Ratio Trade-Off Variables",
    description: "Debt ratio trade-off variables by industry.",
    categorySlug: "capital_structure",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "ratings",
    name: "Ratings and Spreads",
    description: "Bond ratings, default spreads, and coverage ratios.",
    categorySlug: "capital_structure",
    dataType: "other",
    defaultRegionCode: "us",
  },
  {
    key: "leaseeffect",
    name: "Operating Lease Adjustments",
    description: "Operating lease adjustments by industry.",
    categorySlug: "capital_structure",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "macro",
    name: "Macro Data for Debt Design",
    description: "Macro data for debt design analysis.",
    categorySlug: "capital_structure",
    dataType: "timeseries",
    defaultRegionCode: "us",
  },
  {
    key: "divfcfe",
    name: "Dividends vs FCFE",
    description: "Dividends vs free cash flow to equity by industry.",
    categorySlug: "dividend_policy",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "divfund",
    name: "Dividend Policy Trade-Off Variables",
    description: "Dividend trade-off variables by industry.",
    categorySlug: "dividend_policy",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "capex",
    name: "Capital Expenditures and Reinvestment",
    description: "Capex, depreciation, and reinvestment metrics by industry.",
    categorySlug: "cash_flows",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "rd",
    name: "R&D Expenditures",
    description: "R&D expenditures and capitalization metrics by industry.",
    categorySlug: "cash_flows",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "goodwill",
    name: "Goodwill and Impairment",
    description: "Goodwill levels and impairment by industry.",
    categorySlug: "cash_flows",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "margin",
    name: "Operating and Net Margins",
    description: "Profit margins by industry sector.",
    categorySlug: "cash_flows",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "finflows",
    name: "Financing Flows",
    description: "Equity and debt financing flows by industry.",
    categorySlug: "cash_flows",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "wcdata",
    name: "Working Capital Requirements",
    description: "Working capital metrics by industry.",
    categorySlug: "cash_flows",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "roe",
    name: "ROE Decomposition",
    description: "Return on equity decomposition by industry.",
    categorySlug: "growth_reinvestment",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "fundgr",
    name: "Fundamental Growth in EPS",
    description: "Fundamental growth rates in EPS by industry.",
    categorySlug: "growth_reinvestment",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "histgr",
    name: "Historical Growth",
    description: "Historical growth in earnings and revenues by industry.",
    categorySlug: "growth_reinvestment",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "fundgreb",
    name: "Fundamental Growth in EBIT",
    description: "Fundamental growth rates in EBIT by industry.",
    categorySlug: "growth_reinvestment",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "pedata",
    name: "PE and PEG Ratios",
    description: "PE, PEG, and expected growth ratios by industry.",
    categorySlug: "multiples",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "pbvdata",
    name: "Price/Book and ROE",
    description: "Price/book ratios and ROE by industry.",
    categorySlug: "multiples",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "psdata",
    name: "Price/Sales and Margins",
    description: "Price/sales ratios and margins by industry.",
    categorySlug: "multiples",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "vebitda",
    name: "EV/EBIT and EV/EBITDA",
    description: "Enterprise value multiples by industry.",
    categorySlug: "multiples",
    dataType: "industry",
    defaultRegionCode: "us",
  },
  {
    key: "mktcapmult",
    name: "Multiples by Market Cap Class",
    description: "Multiple averages by market cap class (US).",
    categorySlug: "multiples",
    dataType: "other",
    defaultRegionCode: "us",
  },
  {
    key: "countrystats",
    name: "Multiples by Country",
    description: "Average valuation multiples by country.",
    categorySlug: "multiples",
    dataType: "country",
    defaultRegionCode: "global",
  },
  {
    key: "optvar",
    name: "Option Pricing Inputs",
    description: "Firm value and equity value standard deviations by industry.",
    categorySlug: "option",
    dataType: "industry",
    defaultRegionCode: "us",
  },
];

const REGION_SUFFIXES = [
  "europe",
  "japan",
  "rest",
  "emerg",
  "china",
  "india",
  "global",
];

const regionalPattern = (base: string) =>
  `^${base}(?:${REGION_SUFFIXES.join("|")})$`;

const REGIONAL_BASE_DATASETS = [
  "inshold",
  "totalbeta",
  "wacc",
  "taxrate",
  "mktcap",
  "employee",
  "eva",
  "debtdetails",
  "dbtfund",
  "leaseeffect",
  "divfcfe",
  "divfund",
  "capex",
  "goodwill",
  "margin",
  "finflows",
  "wcdata",
  "roe",
  "fundgr",
  "histgr",
  "fundgreb",
  "vebitda",
  "optvar",
];

const SEED_DATASET_MAPPINGS = [
  { pattern: "dollarus", datasetKey: "dollar", isRegex: false },
  { pattern: "r&d", datasetKey: "rd", isRegex: false },
  { pattern: regionalPattern("dollar"), datasetKey: "dollar", isRegex: true },
  { pattern: regionalPattern("r&d"), datasetKey: "rd", isRegex: true },
  ...REGIONAL_BASE_DATASETS.map((base) => ({
    pattern: regionalPattern(base),
    datasetKey: base,
    isRegex: true,
  })),
  {
    pattern: regionalPattern("beta"),
    datasetKey: "betas",
    isRegex: true,
  },
  {
    pattern: regionalPattern("pe"),
    datasetKey: "pedata",
    isRegex: true,
  },
  {
    pattern: regionalPattern("pbv"),
    datasetKey: "pbvdata",
    isRegex: true,
  },
  {
    pattern: regionalPattern("ps"),
    datasetKey: "psdata",
    isRegex: true,
  },
];

export const upsertAll = mutation({
  args: {
    syncToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    for (const category of SEED_CATEGORIES) {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_slug", (q) => q.eq("slug", category.slug))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, category);
      } else {
        await ctx.db.insert("categories", category);
      }
    }

    for (const region of SEED_REGIONS) {
      const existing = await ctx.db
        .query("regions")
        .withIndex("by_code", (q) => q.eq("code", region.code))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, region);
      } else {
        await ctx.db.insert("regions", region);
      }
    }

    for (const dataset of SEED_DATASETS) {
      const existing = await ctx.db
        .query("datasets")
        .withIndex("by_key", (q) => q.eq("key", dataset.key))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, dataset);
      } else {
        await ctx.db.insert("datasets", dataset);
      }
    }

    for (const mapping of SEED_DATASET_MAPPINGS) {
      const existing = await ctx.db
        .query("datasetMappings")
        .withIndex("by_identity", (q) =>
          q
            .eq("pattern", mapping.pattern)
            .eq("datasetKey", mapping.datasetKey)
            .eq("isRegex", mapping.isRegex),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, mapping);
      } else {
        await ctx.db.insert("datasetMappings", mapping);
      }
    }
  },
});

export const getReference = query({
  args: {},
  handler: async (ctx) => {
    const regions = await ctx.db.query("regions").collect();
    const datasets = await ctx.db.query("datasets").collect();
    const datasetMappings = await ctx.db.query("datasetMappings").collect();

    return {
      regions: regions.map((region) => ({
        code: region.code,
        fileTokens: region.fileTokens,
      })),
      datasets: datasets.map((dataset) => ({
        key: dataset.key,
        defaultRegionCode: dataset.defaultRegionCode,
        dataType: dataset.dataType ?? "other",
      })),
      datasetMappings: datasetMappings.map((mapping) => ({
        pattern: mapping.pattern,
        datasetKey: mapping.datasetKey,
        isRegex: mapping.isRegex,
      })),
    };
  },
});
