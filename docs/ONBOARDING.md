# Onboarding

This guide is the first-run path for contributors and technical reviewers. For audit-grade command logs, see [public-repo-audit-phase3.md](./public-repo-audit-phase3.md).

## Who This Is For

- Developers evaluating or contributing to the DCF valuation workbench
- Reviewers who need a reproducible local demo without private services
- Maintainers preparing public-release evidence

## Prerequisites

- Node.js `22.x` and npm `11.x` (see `.nvmrc`)
- Python `3.12+`
- Optional: Bun is installed automatically by harness scripts if missing

## Install (Once)

```bash
nvm use   # optional

npm ci
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
```

Copy [`.env.example`](../.env.example) to `.env.local` only when you need optional services. Never commit real secrets.

## Five-Minute Golden Paths

Pick **one** path first.

### 1. Mock UI demo (fastest, no Python engine)

```bash
NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev
```

Open http://127.0.0.1:3000. Expect mock companies (for example `AAPL`) and valuation cards without Convex or EDGAR.

### 2. Live EDGAR UI (default product path)

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

`DCF_ENGINE_ALLOW_UNSIGNED` and `DCF_RATE_LIMIT_ALLOW_LOCALHOST` are **local-only** flags. Do not use them on hosted deployments. See [public-repo-audit-phase1.md](./public-repo-audit-phase1.md).

### 3. Direct compute (no browser)

```bash
. .venv/bin/activate
npm run demo:compute
```

Uses [`examples/workbench-demo-request.json`](../examples/workbench-demo-request.json). Expect base/bull/bear fair values and Monte Carlo percentiles in JSON.

### 4. Repo alive smoke check

```bash
. .venv/bin/activate
npm run smoke:alive
```

Runs focused JS and Python smoke tests.

## Verification Before A PR

Match checks to your change scope:

```bash
. .venv/bin/activate
npm run harness:verify      # invariants, tests, typecheck, lint, build
npm run harness:e2e:smoke   # Playwright smoke (when UI routes change)
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for PR templates, labels, and review expectations.

## Optional Services

| Service | When you need it |
|---------|------------------|
| Python FastAPI engine | Live EDGAR UI, signed API paths, direct `/dcf/compute` |
| Convex | Saved runs, import persistence, replay history |
| Hugging Face | AI scenario analysis API route |
| SEC EDGAR | Live company search and facts (via engine + `SEC_USER_AGENT`) |

Setup details: [convex-persistence.md](./convex-persistence.md), [ai-scenario-analysis.md](./ai-scenario-analysis.md).

## Next Steps

- [Documentation hub](./README.md)
- [Contributor module guides](./contributor-module-guides.md)
- [Deploy security runbook](../DEPLOY_SECURITY_RUNBOOK.md) (hosted environments only)
