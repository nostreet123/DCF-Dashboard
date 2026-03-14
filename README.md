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

- Mock-backed UI demo with no environment variables required
- FastAPI compute service for direct DCF runs
- Base, bull, and bear scenario valuation output
- Sensitivity analysis and financial projection views
- Optional Monte Carlo summaries and mini-distribution plots
- Optional Convex persistence for saved runs, company facts, and replay flows

## Prototype Vs. Stable

Stable enough for public preview:

- local install and smoke checks
- mock demo mode
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

Persistence via Convex is optional. If you only want to demo the UI or run the compute engine locally, you do not need Convex configured. When enabled, Convex stores saved valuation runs and related facts so they can be replayed from the UI instead of recomputed ad hoc every time.

## Monte Carlo

Monte Carlo is optional and is exposed as a scenario-expansion layer on top of the base DCF run. The engine can return percentile summaries and histogram data so the UI can show a range of plausible outcomes rather than only a single fair value estimate.

Supported query modes for the API routes:

- `mc=fast`: 1,000 simulations
- `mc=default`: 2,000 simulations
- `mc=high`: 10,000 simulations
- `mc=off`: no Monte Carlo output

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

Fastest paths after install:

- UI demo: `npm run dev` then open `http://127.0.0.1:3000`
- Compute demo: `npm run demo:compute`
- Repo alive smoke check: `npm run smoke:alive`

Full onboarding and golden paths live in [`docs/public-repo-audit-phase3.md`](docs/public-repo-audit-phase3.md).

## Demo Paths

### UI Demo

```bash
npm run dev
```

This path uses mock-backed data by default, so contributors can see a working dashboard without configuring external services.

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

## Optional Services And Environment

UI-only demo mode works without env vars. Optional services become relevant when you want persistence, replay history, or production-like service-to-service auth.

Public-safe client/runtime values:

- `NEXT_PUBLIC_CONVEX_URL`
- non-secret tuning flags described in [`.env.example`](.env.example)

Never expose:

- `CONVEX_DEPLOY_KEY`
- `DAMODARAN_SYNC_TOKEN`
- `DCF_ENGINE_INTERNAL_KEY`
- `INTERNAL_PERSISTENCE_KEY`

Operational values that should stay private even if they are not credentials:

- `CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `DCF_ENGINE_URL`
- `DCF_TRUSTED_PROXY_CIDRS`
- `SEC_USER_AGENT`

## API Notes

DCF compute routes:

- `POST /api/dcf/preview`: compute only
- `POST /api/dcf/run`: compute plus optional persistence to Convex

Security defaults:

- Next.js signs FastAPI requests when `DCF_ENGINE_INTERNAL_KEY` is configured.
- FastAPI rejects unsigned requests by default.
- Set `DCF_ENGINE_ALLOW_UNSIGNED=1` only for trusted local development.
- FastAPI docs are disabled by default and can be enabled locally with `DCF_ENGINE_EXPOSE_DOCS=1`.

## Tests

- `npm test`
- `npm run lint`
- `npm run build`
- `cd python && pytest`
- `npx convex typecheck`

E2E support is available through Playwright:

- install browsers once: `npm run test:e2e:install`
- run production-style flow: `npm run test:e2e`
- run mobile emulation: `npm run test:e2e:mobile`

## Public Docs Pack

- Showcase: [`docs/showcase.md`](docs/showcase.md)
- Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Roadmap: [`ROADMAP.md`](ROADMAP.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Release notes: [`docs/releases/v0.1.0.md`](docs/releases/v0.1.0.md)
- Application narrative: [`docs/application-readiness.md`](docs/application-readiness.md)

## Audit Trail

- Phase 1: [`docs/public-repo-audit-phase1.md`](docs/public-repo-audit-phase1.md)
- Phase 2: [`docs/public-repo-audit-phase2.md`](docs/public-repo-audit-phase2.md)
- Phase 3: [`docs/public-repo-audit-phase3.md`](docs/public-repo-audit-phase3.md)
- Phases 4-7: [`docs/public-repo-audit-phase4-7.md`](docs/public-repo-audit-phase4-7.md)

## GitHub Settings To Keep

- Require approval for workflow runs from public forks before untrusted PR code executes in Actions.
- Protect `main` with required checks and code owner review.
- Keep GitHub Actions default workflow permissions read-only unless a workflow needs more.
- Do not use `pull_request_target` to run untrusted PR code.
- Keep `CONVEX_URL` and `DAMODARAN_SYNC_TOKEN` out of PR workflows.
