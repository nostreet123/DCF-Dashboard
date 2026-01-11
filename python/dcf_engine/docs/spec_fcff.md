# FCFF DCF Specification

This document defines the deterministic free cash flow to the firm (FCFF) model used by the DCF engine. All arrays are ordered by time index, and the model is intentionally explicit about indexing to avoid off-by-one errors.

## Time Indexing

- t = 0 is the base year (most recent actual period).
- t = 1..N are explicit forecast years (default N = 10).
- The terminal value is computed at t = N using stable assumptions and represents value at the end of year N.

## Inputs (High-Level)

- Base year revenue (Revenue_0).
- Revenue growth schedule for t = 1..N.
- EBIT margin schedule for t = 1..N.
- Effective tax rate schedule for t = 1..N.
- Sales-to-capital schedule for t = 1..N (used to estimate reinvestment).
- Reinvestment lag (integer years). A lag of L applies the sales-to-capital from t-L to reinvestment at t.
- WACC schedule for t = 1..N.
- Stable growth rate g_stable and stable WACC wacc_stable for the terminal value.
- Balance sheet bridge: cash, debt, and other non-operating adjustments.
- Shares outstanding.
- Optional distress/failure adjustments (probability and recovery fraction).

## Forecast Definitions

Let:
- Revenue_t be revenue at time t.
- Growth_t be revenue growth for year t (t = 1..N).
- EBITMargin_t be EBIT margin for year t (t = 1..N).
- TaxRate_t be effective tax rate for year t (t = 1..N).
- SalesToCapital_t be sales-to-capital for year t (t = 1..N).

Revenue:
- Revenue_0 is given.
- Revenue_t = Revenue_{t-1} * (1 + Growth_t)

EBIT:
- EBIT_t = Revenue_t * EBITMargin_t

After-tax EBIT:
- NOPAT_t = EBIT_t * (1 - TaxRate_t)

Reinvestment (using lag L):
- If t - L >= 1, Reinvestment_t = (Revenue_t - Revenue_{t-1}) / SalesToCapital_{t-L}
- If t - L < 1, Reinvestment_t = (Revenue_t - Revenue_{t-1}) / SalesToCapital_1

FCFF:
- FCFF_t = NOPAT_t - Reinvestment_t

## Discounting

Let WACC_t be the discount rate for year t.

Discount factor:
- DF_t = 1 / (1 + WACC_t)^t

Present value of FCFF:
- PV_FCFF_t = FCFF_t * DF_t

## Terminal Value

Terminal value at the end of year N:
- FCFF_N+1 = FCFF_N * (1 + g_stable)
- TerminalValue_N = FCFF_N+1 / (wacc_stable - g_stable)

Present value of terminal value:
- PV_Terminal = TerminalValue_N * DF_N

Constraint:
- wacc_stable must be strictly greater than g_stable.

## Firm and Equity Value Bridge

Enterprise value:
- FirmValue = sum(PV_FCFF_t for t=1..N) + PV_Terminal

Equity value:
- EquityValue = FirmValue + Cash + OtherNonOperatingAssets - Debt

Per share:
- ValuePerShare = EquityValue / SharesOutstanding
- FairValuePerShare = ValuePerShare (explicit label for output clarity).

Optional distress adjustments (if provided):
- DistressAdjust = (1 - FailureProbability) + FailureProbability * DistressRecoveryFraction
- EquityValueAdjusted = EquityValue * DistressAdjust

## Outputs and Trace

The engine emits:
- Normalized inputs (fully expanded schedules and resolved references).
- Forecast table with per-year metrics.
- Discounting table with WACC, discount factors, PVs, and terminal value.
- Bridge table with equity adjustments.
- A result summary including firm value, equity value, and value per share.
