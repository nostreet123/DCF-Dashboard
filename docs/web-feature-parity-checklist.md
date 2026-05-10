# Web Feature Parity Checklist

Reference: Mac prototype behavior is used only as product guidance. The web app keeps Next.js routes, the Python DCF service, and Convex persistence as the implementation boundaries.

## Public Contracts

- [x] Coverage states: `valuation_ready`, `import_required`, `detail_only`
- [x] Coverage-aware company search result contract
- [x] Import facts contract with reviewed statement facts, provenance, and artifact references
- [x] Company detail route
- [x] Multipart import parse route relayed to Python as signed JSON/base64
- [x] Import approval route that persists and computes from reviewed facts
- [x] Server-only AI scenario route
- [x] Settings status route

## Feature Parity

- [x] Rich valuation output renders live scenarios, sensitivity offsets, KPIs, statement history, Monte Carlo summary, projections, and provenance.
- [x] Official search returns web-native coverage states and source links for SEC plus global adapter listings.
- [x] Coverage filters replace dormant region buttons.
- [x] CSV/XLSX import review supports income, balance sheet, cash flow, and shares/meta lanes through the shared parser.
- [x] Approved imports are stored in Convex with artifact tracking and imported facts.
- [x] PDF import uses a pinned parser dependency and keeps PDF-derived fields review-required.
- [x] Imported runs are written through valuation history with listing identity and provenance.
- [x] Replay normalizer restores scenarios, sensitivity, KPIs, projections, Monte Carlo, statement history, and provenance.
- [x] AI scenario analysis is server-only and rejects malformed provider output.
- [x] Settings panel reports SEC, AI, Convex, history, import readiness, and data mode.
- [x] Recent companies persist in browser local storage separately from valuation history.
- [x] Valuation display is currency-aware; USD display is available only when a conversion value is supplied.

## Final Gate

- [x] `npm run harness:verify`
- [x] `npm run harness:e2e:smoke`
- [x] Focused Python parser/service tests
- [x] Stacked PR review threads triaged and resolved after the parity split
