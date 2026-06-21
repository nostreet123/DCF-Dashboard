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

**Percentile summary** — `p10` and `p90` bound the central 80 % of outcomes. If the base fair value sits near the median, the base case is centered within the simulation. A large gap between the base value and the median means the modeled distribution is centered elsewhere; inspect the histogram before concluding that it is skewed.

**Histogram** — the UI plots simulated fair values as a density histogram. A narrow, symmetric histogram signals stable value across assumptions; a wide or right-skewed histogram signals high sensitivity to upside assumptions.

**Versus base/bull/bear** — the three named scenarios are manually specified discrete cases. Monte Carlo samples continuously between assumption ranges derived from those cases. The p10 is not the bear case, and the p90 is not the bull case. Compare the named base value with the simulated median to see whether the point estimate is centered within the modeled distribution.

## Worked Example

The committed [default sample output](../examples/workbench-demo-output.json) reports:

| Measure | Value per share |
|---|---:|
| Named bear case | `$11.8074` |
| Monte Carlo p10 | `$19.6894` |
| Named base case | `$21.0071` |
| Monte Carlo median | `$22.6683` |
| Monte Carlo p90 | `$25.1626` |
| Named bull case | `$36.3661` |

Read the values in layers:

1. **p10 (`$19.6894`)** means 10% of simulated values are at or below that level and 90% are above it. It is not a prediction that the share price will fall to this value.
2. **Median (`$22.6683`)** divides the simulated runs in half. It sits above the named base value (`$21.0071`), so this modeled distribution is centered modestly above the point estimate.
3. **p90 (`$25.1626`)** means 90% of simulated values are at or below that level and 10% are above it.

The named bear and bull cases are deliberately specified scenario endpoints. They are much wider here than the p10-p90 interval, so neither endpoint should be relabeled as a simulation percentile.

## Reading Histogram Shape

- **Narrow and roughly symmetric:** modeled value is comparatively stable across the sampled assumption ranges.
- **Wide:** small changes in modeled assumptions produce materially different values.
- **Right-skewed:** a minority of favorable assumption combinations creates a long upside tail; the mean may exceed the median.
- **Left-skewed:** adverse combinations create a longer downside tail; the mean may fall below the median.
- **Multiple peaks:** distinct groups of assumption combinations may be producing different valuation regimes.

Histogram shape describes the model under its configured inputs. It is not an empirical market-return distribution and does not assign real-world probabilities unless the sampling assumptions themselves are justified.
