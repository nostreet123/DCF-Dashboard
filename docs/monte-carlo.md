# Monte Carlo

Monte Carlo is optional and is exposed as a scenario-expansion layer on top of the base DCF run. The engine can return percentile summaries and histogram data so the UI can show a range of plausible outcomes rather than only a single fair value estimate.

## Query Modes

The API routes accept an `mc` query parameter:

- `mc=fast`: 5,000 simulations
- `mc=default`: 25,000 simulations
- `mc=high`: 100,000 simulations
- `mc=off`: no Monte Carlo output

These presets map to fixed run/bin counts in `app/api/_lib/monteCarloPreset.ts`.

## How It Works

The engine randomises each assumption (revenue growth, margin, WACC, terminal growth) within a range derived from the spread between the base and bull/bear scenarios, then runs the full DCF for each simulated draw. The result is a distribution of fair values rather than a single point estimate.

Correlated sampling is available by setting `MONTE_CARLO_DEPENDENCE=oneFactor` and `MONTE_CARLO_ONE_FACTOR_LOADING` (see [`.env.example`](../.env.example)).

## Reading the Output

**Percentile summary** — `p10` and `p90` bound the central 80 % of outcomes. If the base fair value sits near the median, the base case is consistent with the simulation. A large gap between the base value and the median often means the distribution is skewed by an asymmetric bull or bear scenario.

**Histogram** — the UI plots simulated fair values as a density histogram. A narrow, symmetric histogram signals stable value across assumptions; a wide or right-skewed histogram signals high sensitivity to upside assumptions.

**Versus base/bull/bear** — the three named scenarios are manually specified discrete cases. Monte Carlo fills in the continuous probability mass between them. The p10 is not the bear case — it is the 10th percentile of the full simulated distribution, which will differ from the hand-crafted bear inputs.
