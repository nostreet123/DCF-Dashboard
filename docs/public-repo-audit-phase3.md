# Phase 3 Public-Repo Audit: Build, Run, and Reproducibility

Date: 2026-05-31 (refreshed; original audit 2026-03-14)

Git ref: `main` @ `3446afc` (OSS PR train complete; harness re-verified 2026-05-31T20:49Z)

Status: PASS

Reviewer summary: [verification.md](./verification.md)

## Goal

A technical newcomer should be able to:

- see the UI quickly
- run one meaningful compute example
- verify the repo is alive without guessing

## 5-Minute Quickstart

```bash
# optional if you use nvm
nvm use

npm ci
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
```

Then choose one of the golden paths below.

## Golden Path 1: Demo The UI

The default dashboard uses live API routes. For the Mac-like EDGAR path, run the Python engine and point the web app at it:

Terminal 1:

```bash
SEC_USER_AGENT='Your Name your.email@example.com' DCF_ENGINE_ALLOW_UNSIGNED=1 npm run dev:engine
```

Terminal 2:

```bash
DCF_ENGINE_URL=http://127.0.0.1:8000 DCF_ENGINE_ALLOW_UNSIGNED=1 DCF_RATE_LIMIT_ALLOW_LOCALHOST=1 npm run dev
```

For a UI-only mock-backed dashboard demo, opt in explicitly:

```bash
NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev
```

Open `http://127.0.0.1:3000`.

Meaningful live result to expect:

- searching a US ticker routes through the local Python service and EDGAR-backed company APIs
- the dashboard renders valuation output from the Python engine

Meaningful mock result to expect:

- the dashboard renders with mock valuation cards

- the search box finds mock companies like `AAPL`, `MSFT`, or `GOOGL`
- changing drawers/tabs works without Convex or the Python service

## Golden Path 2: Test The Compute Flow

This path exercises the Python DCF engine directly, without needing to start the web UI.

```bash
npm run demo:compute
```

Meaningful result to expect:

- JSON output with `base_fair_value_per_share`
- `bull` and `bear` fair values
- a sensitivity grid shape
- Monte Carlo summary percentiles

The demo payload lives in `examples/workbench-demo-request.json`.
To run a different payload directly, use `python scripts/run_workbench_demo.py <path-to-json>`.

If you want to hit the local HTTP service instead of the direct Python runner:

Terminal 1:

```bash
. .venv/bin/activate
DCF_ENGINE_ALLOW_UNSIGNED=1 npm run dev:engine
```

Terminal 2:

```bash
curl \
  -X POST http://127.0.0.1:8000/dcf/compute \
  -H 'content-type: application/json' \
  --data @examples/workbench-demo-request.json
```

## Golden Path 3: Verify The Repo Is Alive

```bash
npm run smoke:alive
```

This runs a fast mixed smoke check:

- focused Bun tests for JS/runtime wiring
- focused pytest smoke checks for the Python engine

## Smoke Test Checklist

- `npm ci` completes with no lockfile drift
- Python venv install completes from `requirements-dev.txt` and `constraints.txt`
- `npm run dev` shows a working dashboard at `http://127.0.0.1:3000`
- `python scripts/run_workbench_demo.py examples/workbench-demo-request.json` prints a valuation summary
- `npm run smoke:alive` passes

## Exact Commands Verified

Verified on 2026-05-31T20:49Z (Cursor Cloud agent workspace, `main` @ `3446afc`):

```bash
npm ci
python3 scripts/check_repo_invariants.py
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
npm run demo:compute
npm run smoke:alive
npm run harness:verify
```

Prior audit (2026-03-14) also recorded: `npm run lint`, `npm run build`, `npm test`, and `cd python && pytest` individually — all are included inside `harness:verify` today.

### Sample output fingerprint

`npm run demo:compute` against `examples/workbench-demo-request.json` produced committed output in `examples/workbench-demo-output.json` (`sensitivity_grid` shape `[9, 9]`, Monte Carlo seed `123`, `base_fair_value_per_share` ≈ `21.01`). Refresh that file when valuation kernel outputs change.
