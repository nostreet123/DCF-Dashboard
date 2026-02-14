# DCF-Dashboard
A prototype for a Damodaran DCF Dashboard inspired by his valuation Excel model.

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
