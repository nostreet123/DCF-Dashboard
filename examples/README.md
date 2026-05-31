# Examples

Reproducible request and response payloads for the Python workbench / FastAPI compute path.

> **Disclaimer:** Sample outputs are synthetic modeling illustrations, not investment advice or market prices.

## Files

| File | Description |
|------|-------------|
| `workbench-demo-request.json` | Default high-growth tech-style assumptions (3-year explicit period) |
| `workbench-demo-output.json` | Engine output for the default request (regenerate after engine changes) |
| `consumer-staples-demo-request.json` | Slower-growth, more capital-intensive profile for contrast |
| `consumer-staples-demo-output.json` | Engine output for the consumer-staples request |

## Run The Default Demo

From the repository root with Python venv active:

```bash
. .venv/bin/activate
npm run demo:compute
```

This runs `python scripts/run_workbench_demo.py examples/workbench-demo-request.json` and prints JSON to stdout.

## Run A Custom Payload

```bash
. .venv/bin/activate
python scripts/run_workbench_demo.py examples/consumer-staples-demo-request.json
```

## Regenerate Committed Outputs

After changing valuation logic, refresh golden JSON so docs and reviewers stay accurate:

```bash
. .venv/bin/activate
python scripts/run_workbench_demo.py examples/workbench-demo-request.json \
  > examples/workbench-demo-output.json
python scripts/run_workbench_demo.py examples/consumer-staples-demo-request.json \
  > examples/consumer-staples-demo-output.json
```

Review the diff for expected numeric changes only. Do not commit secrets or environment-specific paths.

## HTTP Alternative

With the FastAPI engine running locally (see [docs/ONBOARDING.md](../docs/ONBOARDING.md)):

```bash
curl -s -X POST http://127.0.0.1:8000/dcf/compute \
  -H 'content-type: application/json' \
  --data @examples/workbench-demo-request.json
```

Signed hosted deployments require internal auth headers — prefer `npm run demo:compute` for local verification.

## See Also

- [docs/showcase.md](../docs/showcase.md) — representative fair values from these payloads
- [python/dcf_engine/docs/spec_fcff.md](../python/dcf_engine/docs/spec_fcff.md) — FCFF engine specification
