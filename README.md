# DCF-Dashboard
A prototype for a Damodaran DCF Dashboard inspired by his valuation Excel model.

## Install

```bash
npm install          # JavaScript/TypeScript (canonical lockfile: package-lock.json)
pip install -r python/requirements.txt   # Python packages
```

Bun is used only as the test runner (`bun test`). npm is the canonical package manager for dependency tracking and security alerts.

## API (prototype)

DCF compute routes (Next.js → FastAPI):
- `POST /api/dcf/preview` (compute only)
- `POST /api/dcf/run` (compute + persist run to Convex)

Internal service auth:
- Next.js signs all FastAPI requests when `DCF_ENGINE_INTERNAL_KEY` is configured.
- FastAPI rejects unsigned direct requests when `DCF_ENGINE_INTERNAL_KEY` is set.
- FastAPI docs are disabled by default; set `DCF_ENGINE_EXPOSE_DOCS=1` only for local/dev use.

Rate-limit identity defaults:
- Next.js API routes trust `x-vercel-forwarded-for` by default (`RATE_LIMIT_IDENTITY_SOURCE=vercel`).
- FastAPI `/dcf/compute` uses socket client IP by default (`DCF_TRUSTED_PROXY_MODE=off`).
- Enable compatibility/proxy modes explicitly via `.env.example` settings when running outside default deployment assumptions.

Monte Carlo (optional):
- Add `?mc=fast|default|high|off` to either endpoint.
  - `fast`: 1,000 sims
  - `default`: 2,000 sims
  - `high`: 10,000 sims
  - `off`: no Monte Carlo output

If enabled, responses include `monteCarlo` with summary percentiles and a small histogram for UI mini-distribution plots.

## Tests

- Next/Node: `bun test`
- E2E (Playwright):
  - one-time: `bun run test:e2e:install`
  - run: `bun run test:e2e`
  - mobile (emulated): `bun run test:e2e:mobile`
  - iPhone 15 Pro Max (emulated): `bun run test:e2e:iphone`
  - refresh iPhone visual baseline: `bun run test:e2e:iphone:update-visual`
  - realtime QA (headed): `bun run test:e2e:ui`
  - realtime QA (slower): `bun run test:e2e:qa`
  - note: `bun run test:e2e:ui` serves Playwright UI on `http://localhost:9323`.
  - note: on Linux without `$DISPLAY`, headed runs auto-fallback to Xvfb (not visually observable).
- Convex: `bunx convex typecheck`
- Python: `cd python && pytest`

## Frontend Runtime Notes

- Client boot expects `NEXT_PUBLIC_CONVEX_URL` when Convex-backed data is enabled.
- For local UI-only prototyping, the app now degrades gracefully when this value is missing.
- Copy `.env.example` to `.env.local` and set:
  - `CONVEX_URL`
  - `NEXT_PUBLIC_CONVEX_URL`

## Mobile Navigation

- At tablet/mobile breakpoints, side rails move into slide-over drawers.
- Top bar controls:
  - **Library** button opens Dataset Library + Run History.
  - **Assumptions** button opens slider controls + sensitivity drivers.
  - **Search** button opens mobile search overlay.

## Public Repo Hardening

If this repository is made public, keep these GitHub settings in place:

- Require approval for workflow runs from public forks before untrusted PR code executes in Actions.
- Protect `main` with required status checks, at least one approval, and code owner review for sensitive paths in `.github/CODEOWNERS`.
- Keep GitHub Actions default workflow permissions read-only unless a specific workflow needs more.
- Do not use `pull_request_target` to check out or run code from untrusted pull requests.
- Keep `CONVEX_URL` and `DAMODARAN_SYNC_TOKEN` scoped to scheduled or manually triggered workflows, never PR workflows.
