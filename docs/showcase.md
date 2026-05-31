# Showcase

DCF Dashboard should be legible as a product, not only as source code. This page collects public-proof artifacts for OSS reviewers.

> **Disclaimer:** Screenshots and sample outputs illustrate financial **modeling and education only**. They are not investment advice, recommendations, or live market prices.

## Screenshots

Captured from **mock demo mode** (`NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo`) using fictional/sample company data. Redaction review: no API keys, deployment URLs, or maintainer contact details appear in the images.

### Homepage

![Homepage screenshot](assets/dashboard-home.png)

### Assumptions Panel

![Assumptions panel screenshot](assets/assumptions-panel.png)

### Example Valuation Flow

![Valuation flow screenshot](assets/valuation-flow.png)

### Monte Carlo Output

![Monte Carlo output screenshot](assets/monte-carlo-output.png)

## Example Use Case

One practical use case is a maintainer or analyst reviewing a company case with default assumptions, comparing base versus bull and bear cases, then checking whether the Monte Carlo distribution supports or challenges the point estimate before saving the run. The mock-backed UI proves the workflow quickly, while the direct compute demo shows the engine can also be exercised without the browser.

## Example Output

Two sample cases are included to show how different company profiles produce different valuation ranges.

### Case 1 — High-growth tech profile

A higher-growth, asset-light business (8 % base revenue growth, 20 % EBIT margin, low capital intensity).

- Request: [`examples/workbench-demo-request.json`](../examples/workbench-demo-request.json)
- Output: [`examples/workbench-demo-output.json`](../examples/workbench-demo-output.json)

Representative values:

- Base fair value per share: `$21.01`
- Bull fair value per share: `$36.37`
- Bear fair value per share: `$11.81`
- Monte Carlo median: `$20.72`
- Monte Carlo p10 / p90: `$17.17 / $24.38`

### Case 2 — Mature consumer-staples profile

A slower-growth, more capital-intensive business (3 % base revenue growth, 15 % EBIT margin, higher leverage). This case shows how the valuation range compresses when growth assumptions are lower and the discount rate is tighter.

- Request: [`examples/consumer-staples-demo-request.json`](../examples/consumer-staples-demo-request.json)
- Output: [`examples/consumer-staples-demo-output.json`](../examples/consumer-staples-demo-output.json)

Representative values:

- Base fair value per share: `$10.59`
- Bull fair value per share: `$17.06`
- Bear fair value per share: `$6.44`
- Monte Carlo median: `$10.94`
- Monte Carlo p10 / p90: `$9.18 / $12.70`

The two cases together illustrate how growth rate, margin profile, capital intensity, and leverage interact to produce very different absolute values and scenario spreads — even when the same engine and the same DCF mechanics are applied.

## Regenerating Screenshots (Maintainers)

```bash
NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev
# separate terminal:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/capture_showcase_screenshots.mjs
```

Requires `npm exec playwright install chromium` once per machine. Re-run after major UI changes and repeat the redaction checklist in [provider-data-flow.md](./provider-data-flow.md).
