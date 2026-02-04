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
