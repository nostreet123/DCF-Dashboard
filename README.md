# DCF-Dashboard
A prototype for a Damodaran DCF Dashboard inspired by his valuation Excel model.

## API (prototype)

DCF compute routes (Next.js → FastAPI):
- `POST /api/dcf/preview` (compute only)
- `POST /api/dcf/run` (compute + persist run to Convex)

Status behavior:
- `400` for invalid request payloads (including engine-side validation failures)
- `502` for upstream engine transport/service failures

Monte Carlo (optional):
- Add `?mc=fast|default|high|off` to either endpoint.
  - `fast`: 1,000 sims
  - `default`: 2,000 sims
  - `high`: 10,000 sims
  - `off`: no Monte Carlo output

If enabled, responses include `monteCarlo` with summary percentiles and a small histogram for UI mini-distribution plots.

## Debug System

All DCF API responses now include:
- `x-debug-id`: correlation ID for cross-layer tracing
- `x-debug-level`: active debug level (`error|standard|verbose`)

Debug flow:
1. Next API generates/accepts a correlation ID.
2. Correlation/debug headers are forwarded to the Python engine.
3. Convex stores correlated records in:
   - `valuationRuns`
   - `syncLogs`
   - `syncErrors`
   - `debugEvents`

Operator scripts:
- `bun run debug:timeline -- --correlation-id=<id> [--limit=100]`
- `bun run debug:failures -- [--limit=50] [--source=next_api|python_service|damodaran_sync|convex]`

Retention defaults:
- errors: 90 days
- traces/non-error debug events: 30 days

## Tests

- Next/Node: `npm test`
- Convex: `bunx convex typecheck`
- Python: `cd python && pytest`
