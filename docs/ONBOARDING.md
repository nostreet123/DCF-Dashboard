# Onboarding

This is the shortest path from a fresh clone to a useful local result. For current pass/fail evidence, see [verification.md](./verification.md). For service boundaries and ports, see [contributor-module-guides.md](./contributor-module-guides.md).

## Prerequisites

- Node.js `22.x` (`.nvmrc`)
- npm `11.x` (`package.json` pins npm `11.6.2`)
- Python `3.12+`
- Bun `1.3.10` for tests; repository scripts install it into `.bun-home/` when it is not already available

Convex, SEC EDGAR access, and a Hugging Face key are optional. None are required for the first mock demo.

## Install Once

```bash
nvm use  # if you use nvm
npm ci

python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
```

Copy [`.env.example`](../.env.example) to `.env.local` only when you need an optional service. Never commit real secrets.

## First Success: No Secrets, No Services

```bash
NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev
```

Open http://127.0.0.1:3000. A successful run shows the dashboard with mock company data and valuation cards. Stop the server with `Ctrl-C`.

Then run the smallest repository check:

```bash
. .venv/bin/activate
npm run smoke:alive
```

This path proves the UI and focused JavaScript/Python checks without Convex, SEC credentials, or an AI-provider key.

## Direct Engine Compute

```bash
. .venv/bin/activate
npm run demo:compute
```

Pass criterion: JSON containing base, bull, and bear fair values plus Monte Carlo percentiles. The command uses [`examples/workbench-demo-request.json`](../examples/workbench-demo-request.json).

## Live EDGAR UI

Use this only after the no-secret path works.

Terminal 1:

```bash
. .venv/bin/activate
SEC_USER_AGENT='Your Name your.email@example.com' \
DCF_ENGINE_ALLOW_UNSIGNED=1 \
npm run dev:engine
```

Terminal 2:

```bash
DCF_ENGINE_URL=http://127.0.0.1:8000 \
DCF_ENGINE_ALLOW_UNSIGNED=1 \
DCF_RATE_LIMIT_ALLOW_LOCALHOST=1 \
npm run dev
```

`DCF_ENGINE_ALLOW_UNSIGNED`, `DCF_RATE_LIMIT_ALLOW_LOCALHOST`, and `DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES` are trusted local-development escapes. Never set them on a hosted public preview.

## Common Setup Failures

| Symptom | Check | Fix |
|---|---|---|
| `node` or npm version rejected | `node --version && npm --version` | Run `nvm use`, then reinstall with `npm ci` |
| Python imports fail | `which python && python --version` | Run `. .venv/bin/activate`, then reinstall `python/requirements-dev.txt` with `python/constraints.txt` |
| Bun is missing | `npm run smoke:alive` output | Let `scripts/ensure_bun.sh` install the pinned runner into `.bun-home/`; do not switch package managers |
| Port 3000 is occupied | `lsof -nP -iTCP:3000 -sTCP:LISTEN` | Stop the stale process or run `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev -- --port 3001` |
| Live EDGAR routes fail | Confirm `SEC_USER_AGENT` and the Python service | Return to mock mode first; use the live-service instructions only after the no-secret path passes |
| Convex or AI features are unavailable | Inspect optional environment values | Expected when optional services are unset; the mock demo and direct compute still work |

## Optional Services

| Service | When you need it |
|---|---|
| Python FastAPI engine | Live EDGAR UI, signed API paths, direct `/dcf/compute` |
| Convex | Saved runs, import persistence, replay history |
| Hugging Face | AI scenario analysis |
| SEC EDGAR | Live company search and facts through the Python engine |

Setup details: [convex-persistence.md](./convex-persistence.md), [ai-scenario-analysis.md](./ai-scenario-analysis.md), and [DEPLOY_SECURITY_RUNBOOK.md](../DEPLOY_SECURITY_RUNBOOK.md).

## Where To Start Contributing

| Interest | Start here | First verification |
|---|---|---|
| Documentation and examples | `docs/`, `examples/` | `python scripts/check_repo_invariants.py` and `npm run demo:compute` |
| Dashboard UI and state | `app/`, `components/`, `lib/` | `npm run test:ui:focused` |
| API routes and service auth | `app/api/`, `python/dcf_engine/service/` | `npm run test:security:focused` |
| Valuation engine | `python/dcf_engine/`, `python/tests/` | `npm run test:py:engine` and `bash scripts/run_pytest.sh python/tests/test_workbench_monte_carlo.py python/tests/test_workbench_sensitivity.py` |
| Convex persistence and sync | `convex/`, `convex_tests/`, `python/damodaran_sync/` | `scripts/ensure_bun.sh bunx convex typecheck`, `npm run test:convex:focused`, and `npm run test:py:sync` for `python/damodaran_sync/` changes |

Read [contributor-module-guides.md](./contributor-module-guides.md) before changing a cross-service boundary.

## Before Opening A Pull Request

```bash
. .venv/bin/activate
npm run harness:verify
```

Run `npm run harness:e2e:smoke` as well when browser routes or rendered workflows change. See [CONTRIBUTING.md](../CONTRIBUTING.md) for PR templates and review expectations.
