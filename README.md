# DCF Dashboard

DCF Dashboard is an open-source valuation workbench for exploring discounted cash flow assumptions in a browser. It pairs a Next.js interface with a Python DCF engine, optional Monte Carlo distribution analysis, and optional Convex-backed persistence for saved runs and company facts.

## What Problem It Solves

Most DCF workflows live in spreadsheets, scattered notes, and one-off scenario tabs. This project puts the core workflow into a reproducible app so you can:

- inspect a company-level fair value estimate
- compare base, bull, and bear cases
- stress-test growth and discount-rate assumptions
- review a Monte Carlo range instead of a single point estimate
- optionally persist and replay valuation runs through Convex

## What Works Today

- Live EDGAR-backed dashboard mode by default when the Python service is configured
- Explicit mock-backed UI demo that needs only `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo`, with no external services or secrets required
- FastAPI compute service for direct DCF runs
- Base, bull, and bear scenario valuation output
- Sensitivity analysis and financial projection views
- Optional Monte Carlo summaries and mini-distribution plots
- Optional Convex persistence for saved runs, company facts, and replay flows
- Live global company search with coverage states for valuation-ready, import-required, and detail-only listings
- CSV/XLSX/PDF import review paths that preserve approved artifacts and facts through Convex when configured
- Server-only AI scenario analysis via Hugging Face configuration

## Prototype Vs. Stable

Stable enough for public preview:

- local install and smoke checks
- explicit mock demo mode
- direct compute flow
- public repo governance and security defaults

Still prototype / evolving:

- production deployment topology
- Convex-backed persistence setup for outside contributors
- broader data-source coverage beyond the current demo and sync flows
- long-term contributor workflows and triage volume

## Architecture At A Glance

- `app/`: Next.js workbench UI and API routes
- `python/dcf_engine/`: valuation engine and FastAPI service
- `convex/`: optional persistence, replay history, and sync-backed data paths
- `examples/`: sample request payloads for reproducible demos
- `docs/`: audit artifacts, roadmap, release notes, and showcase material

Persistence via Convex is optional. If you only want to demo the UI or run the compute engine locally, you do not need Convex configured. When enabled, Convex stores saved valuation runs and related facts so they can be replayed from the UI instead of recomputed ad hoc every time. The full request flow, env vars, and local setup steps are documented in [`docs/convex-persistence.md`](docs/convex-persistence.md).

## Monte Carlo

Monte Carlo is an optional scenario-expansion layer on top of the base DCF run. It returns percentile summaries and histogram data so the UI can show a range of outcomes rather than a single point estimate. Modes are selected with the `mc` query parameter:

- `mc=fast`: 5,000 simulations
- `mc=default`: 25,000 simulations
- `mc=high`: 100,000 simulations
- `mc=off`: no Monte Carlo output

See [`docs/monte-carlo.md`](docs/monte-carlo.md) for how the simulation works and how to read the percentile summary and histogram.

## Web Feature Parity

The web app implements the Mac prototype parity surface as web-native routes and components. The Python DCF engine remains the valuation source of truth; Swift valuation code is not ported.

- Search uses `CoverageState` to branch listings into immediate valuation, import review, or source-detail views.
- Approved imports persist reviewed facts and artifact references in Convex, then compute from those facts immediately.
- Rich run output includes scenario values, KPIs, statement history, projections, sensitivity offsets, Monte Carlo summaries, and provenance.
- AI scenario analysis is server-only; provider secrets never go to the browser. Configuration, the maximum-reasoning DeepSeek demo recipe, and public-demo cost controls are documented in [`docs/ai-scenario-analysis.md`](docs/ai-scenario-analysis.md).
- Settings status reports SEC user-agent, AI, Convex/history/import readiness, and active data mode.

The parity checklist lives in [`docs/web-feature-parity-checklist.md`](docs/web-feature-parity-checklist.md).

## Five-Minute Quickstart

```bash
# optional if you use nvm
nvm use

npm ci
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
```

Bun is used only as the test runner under the npm scripts. `npm` is the canonical JavaScript package manager for this repo.
If Bun is not installed globally, the repo harness installs the pinned Bun version into ignored `.bun-home/` automatically.

Fastest paths after install:

- Live EDGAR UI: start the Python engine, then start Next.js with `DCF_ENGINE_URL=http://127.0.0.1:8000`
- Mock UI demo: `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev`
- Compute demo: `npm run demo:compute`
- Repo alive smoke check: `npm run smoke:alive`
- Agent/PR verification: `npm run harness:verify`

Full onboarding and golden paths live in [`docs/public-repo-audit-phase3.md`](docs/public-repo-audit-phase3.md).

## Demo Paths

### Live EDGAR UI

```bash
# Terminal 1
. .venv/bin/activate
SEC_USER_AGENT='Your Name your.email@example.com' \
DCF_ENGINE_ALLOW_UNSIGNED=1 \
npm run dev:engine

# Terminal 2
DCF_ENGINE_URL=http://127.0.0.1:8000 \
DCF_ENGINE_ALLOW_UNSIGNED=1 \
DCF_RATE_LIMIT_ALLOW_LOCALHOST=1 \
npm run dev
```

This path uses live dashboard API routes by default, matching the Mac prototype’s EDGAR-backed behavior.

For a UI-only mock demo without the Python service, run:

```bash
NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev
```

### Direct Compute Flow

```bash
. .venv/bin/activate
DCF_ENGINE_ALLOW_UNSIGNED=1 npm run dev:engine
curl -s -X POST http://127.0.0.1:8000/dcf/compute \
  -H 'content-type: application/json' \
  --data @examples/workbench-demo-request.json
```

### Repo Alive Check

```bash
. .venv/bin/activate
npm run smoke:alive
```

### Agent / PR Verification

```bash
. .venv/bin/activate
npm run harness:verify
```

This runs repository invariant checks, Bun tests, pytest, production and test TypeScript typecheck, Convex typecheck, lint, and a production build. For a targeted browser smoke check, run `npm run harness:e2e:smoke`.

## Optional Services And Environment

Explicit UI-only demo mode works with `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo` and no external services or secrets. The default dashboard path is live and expects the Python service plus EDGAR configuration; optional services become relevant when you want persistence, replay history, or production-like service-to-service auth.

Every environment variable — public-safe client values, operationally private values, and server-only secrets — is grouped and documented in [`.env.example`](.env.example). Convex setup specifically is covered in [`docs/convex-persistence.md`](docs/convex-persistence.md).

## API Notes

DCF compute routes:

- `POST /api/dcf/preview`: compute only
- `POST /api/dcf/run`: compute plus optional persistence to Convex
- `GET /api/company/detail?id=...`: official listing metadata and source links
- `POST /api/company/import/parse`: multipart CSV/XLSX/PDF import parsing
- `POST /api/company/import/approve`: persist reviewed facts and compute imported valuation
- `POST /api/ai/scenario-analysis`: strict server-only AI assumptions and rationale
- `GET /api/settings/status`: data and integration readiness summary

Security defaults: Next.js signs FastAPI requests when `DCF_ENGINE_INTERNAL_KEY` is configured, FastAPI rejects unsigned requests by default, and signed requests use Convex-backed nonce replay protection. Local-only opt-outs (`DCF_ENGINE_ALLOW_UNSIGNED`, `DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES`, `DCF_ENGINE_EXPOSE_DOCS`) and the full rollout procedure are documented in [`DEPLOY_SECURITY_RUNBOOK.md`](DEPLOY_SECURITY_RUNBOOK.md).

## Tests

- `npm run harness:verify`
- `npm run harness:e2e:smoke`
- `npm test`
- `npm run typecheck:test`
- `npm run lint`
- `npm run build`
- `cd python && pytest`
- `npx convex typecheck`

E2E support is available through Playwright:

- install browsers once: `npm run test:e2e:install`
- run production-style flow: `npm run test:e2e`
- run mobile emulation: `npm run test:e2e:mobile`
- run local interactive UI mode: `npm run test:e2e:ui` (serves Playwright UI on loopback only at `http://127.0.0.1:9323`)

## Docs And Audit Trail

- Showcase: [`docs/showcase.md`](docs/showcase.md)
- Contributing guide (incl. maintainer repo settings): [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Roadmap: [`ROADMAP.md`](ROADMAP.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Release notes: [`docs/releases/v0.1.0.md`](docs/releases/v0.1.0.md)
- Application narrative: [`docs/application-readiness.md`](docs/application-readiness.md)
- Monte Carlo: [`docs/monte-carlo.md`](docs/monte-carlo.md)
- AI scenario analysis: [`docs/ai-scenario-analysis.md`](docs/ai-scenario-analysis.md)
- Convex persistence: [`docs/convex-persistence.md`](docs/convex-persistence.md)
- Data model: [`DATA_MODEL.md`](DATA_MODEL.md)
- Web feature parity: [`docs/web-feature-parity-checklist.md`](docs/web-feature-parity-checklist.md)
- Deploy/security runbook: [`DEPLOY_SECURITY_RUNBOOK.md`](DEPLOY_SECURITY_RUNBOOK.md)
- Public-repo audit trail: [phase 1](docs/public-repo-audit-phase1.md), [phase 2](docs/public-repo-audit-phase2.md), [phase 3](docs/public-repo-audit-phase3.md), [phases 4-7](docs/public-repo-audit-phase4-7.md)
