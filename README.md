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

Persistence via Convex is optional. If you only want to demo the UI or run the compute engine locally, you do not need Convex configured. When enabled, Convex stores saved valuation runs and related facts so they can be replayed from the UI instead of recomputed ad hoc every time.

## Monte Carlo

Monte Carlo is optional and is exposed as a scenario-expansion layer on top of the base DCF run. The engine can return percentile summaries and histogram data so the UI can show a range of plausible outcomes rather than only a single fair value estimate.

Supported query modes for the API routes:

- `mc=fast`: 5,000 simulations
- `mc=default`: 25,000 simulations
- `mc=high`: 100,000 simulations
- `mc=off`: no Monte Carlo output

## Web Feature Parity

The web app implements the Mac prototype parity surface as web-native routes and components. The Python DCF engine remains the valuation source of truth; Swift valuation code is not ported.

- Search uses `CoverageState` to branch listings into immediate valuation, import review, or source-detail views.
- Approved imports persist reviewed facts and artifact references in Convex, then compute from those facts immediately.
- Rich run output includes scenario values, KPIs, statement history, projections, sensitivity offsets, Monte Carlo summaries, and provenance.
- AI scenario analysis uses server-side `HUGGING_FACE_API_KEY` and `HUGGING_FACE_MODEL`; secrets never go to the browser. For maximum-reasoning DeepSeek demos, set `HUGGING_FACE_MODEL=deepseek-ai/DeepSeek-V4-Pro:fastest`, `HUGGING_FACE_REASONING_EFFORT=xhigh`, `HUGGING_FACE_RESPONSE_FORMAT=json_object`, `HUGGING_FACE_MAX_INPUT_BYTES=4000000`, `HUGGING_FACE_MAX_OUTPUT_TOKENS=8192`, and `HUGGING_FACE_PROVIDER_TIMEOUT_MS=90000` so the app can pass a 384K-token-scale context budget while bounding slow provider attempts. The `:fastest` suffix is a Hugging Face router provider-selection policy on the model id, not part of the JSON schema. Public demos can set per-IP/daily AI caps and an optional admin bypass via `DCF_DEMO_ADMIN_TOKEN_SHA256`, which stores only a SHA-256 digest of your admin token.
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

This runs repository invariant checks, Bun tests, pytest, Convex typecheck, a production build, and lint. For a targeted browser smoke check, run `npm run harness:e2e:smoke`.

## Optional Services And Environment

Explicit UI-only demo mode works with `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo` and no external services or secrets. The default dashboard path is live and expects the Python service plus EDGAR configuration; optional services become relevant when you want persistence, replay history, or production-like service-to-service auth.

Public-safe client/runtime values:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo` for explicit mock-backed dashboard mode
- `NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS=1` only when browser-readable saved-run history is enabled server-side
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
- `VALUATION_HISTORY_BROWSER_READS`

## API Notes

DCF compute routes:

- `POST /api/dcf/preview`: compute only
- `POST /api/dcf/run`: compute plus optional persistence to Convex
- `GET /api/company/detail?id=...`: official listing metadata and source links
- `POST /api/company/import/parse`: multipart CSV/XLSX/PDF import parsing
- `POST /api/company/import/approve`: persist reviewed facts and compute imported valuation
- `POST /api/ai/scenario-analysis`: strict server-only AI assumptions and rationale
- `GET /api/settings/status`: data and integration readiness summary

Security defaults:

- Next.js signs FastAPI requests when `DCF_ENGINE_INTERNAL_KEY` is configured.
- FastAPI rejects unsigned requests by default.
- Signed FastAPI requests use Convex-backed nonce replay protection when `CONVEX_URL` and `DAMODARAN_SYNC_TOKEN` are configured.
- Set `DCF_ENGINE_ALLOW_UNSIGNED=1` only for trusted local development.
- Set `DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES=1` only for single-process private/dev FastAPI runs without Convex-backed replay protection.
- FastAPI docs are disabled by default and can be enabled locally with `DCF_ENGINE_EXPOSE_DOCS=1`.

## Tests

- `npm run harness:verify`
- `npm run harness:e2e:smoke`
- `npm test`
- `npm run lint`
- `npm run build`
- `cd python && pytest`
- `npx convex typecheck`

E2E support is available through Playwright:

- install browsers once: `npm run test:e2e:install`
- run production-style flow: `npm run test:e2e`
- run mobile emulation: `npm run test:e2e:mobile`
- run local interactive UI mode: `npm run test:e2e:ui` (serves Playwright UI on loopback only at `http://127.0.0.1:9323`)

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
