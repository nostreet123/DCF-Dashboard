# DCF-Dashboard
A prototype for a Damodaran DCF Dashboard inspired by his valuation Excel model.

## Install

```bash
npm install          # JavaScript/TypeScript (canonical lockfile: package-lock.json)
pip install -e ./python[dev]   # Python packages
```

Bun is used only as the test runner (`bun test`). npm is the canonical package manager for dependency tracking and security alerts.

## API (prototype)

DCF compute routes (Next.js → FastAPI):
- `POST /api/dcf/preview` (compute only)
- `POST /api/dcf/run` (compute + persist run to Convex)

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
