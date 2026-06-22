# DCF Dashboard

[![CI](https://github.com/nostreet123/DCF-Dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/nostreet123/DCF-Dashboard/actions/workflows/ci.yml)
[![Codespell](https://github.com/nostreet123/DCF-Dashboard/actions/workflows/codespell.yml/badge.svg)](https://github.com/nostreet123/DCF-Dashboard/actions/workflows/codespell.yml)
[![Secret Scan](https://github.com/nostreet123/DCF-Dashboard/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/nostreet123/DCF-Dashboard/actions/workflows/secret-scan.yml)
[![CodeQL](https://github.com/nostreet123/DCF-Dashboard/actions/workflows/codeql.yml/badge.svg)](https://github.com/nostreet123/DCF-Dashboard/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

DCF Dashboard is an open-source valuation workbench that turns spreadsheet-style DCF analysis into reproducible browser workflows. It pairs a Next.js interface with a Python valuation engine, scenario comparison, optional Monte Carlo ranges, and saved-run workflows.

**Documentation hub:** [`docs/README.md`](docs/README.md) · **First run:** [`docs/ONBOARDING.md`](docs/ONBOARDING.md)

![DCF Dashboard home](docs/assets/dashboard-home.png)

## Use It

Try the hosted demo on Vercel: [`dcf-dashboard-iota.vercel.app`](https://dcf-dashboard-iota.vercel.app).

You can also run the mock-backed demo locally:

```bash
npm ci
NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev
```

Open `http://localhost:3000`.

## Who It Is For

- Learners and builders who want a reproducible DCF workflow instead of a one-off spreadsheet
- Contributors who care about transparent assumptions, tests, and safe public defaults
- Reviewers evaluating OSS readiness — not investors seeking trading signals

## Disclaimer

Outputs are for **financial modeling and education only**. They are not investment advice, recommendations, or guarantees of accuracy. Validate assumptions and data before relying on any estimate.

## Public Preview Boundary

This repository is **public-source ready**, not a hosted SaaS product. You can clone, demo, test, and adapt it yourself, but hosted SaaS operations are intentionally out of scope.

See [SECURITY.md](SECURITY.md) for the public trust model and security reporting process.

## Run It Locally

```bash
# optional if you use nvm
nvm use

npm ci
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
```

Demo mode is mock-backed, so it does not require external services or private credentials. Full onboarding lives in [`docs/ONBOARDING.md`](docs/ONBOARDING.md).

## What Problem It Solves

Most DCF workflows live in spreadsheets, scattered notes, and one-off scenario tabs. This project puts the core workflow into a reproducible app so you can:

- inspect a company-level fair value estimate
- compare base, bull, and bear cases
- stress-test growth and discount-rate assumptions
- review a Monte Carlo range instead of a single point estimate

## Screenshots

![Assumptions panel](docs/assets/assumptions-panel.png)

![Monte Carlo output](docs/assets/monte-carlo-output.png)

## What Works Today

- Mock-backed browser demo
- FastAPI compute service for direct DCF runs
- Base, bull, and bear scenario valuation output
- Sensitivity analysis and financial projection views
- Optional Monte Carlo summaries
- Optional persistence and import workflows for local or self-hosted setups

## Prototype Vs. Stable

Stable enough for public preview:

- local install and smoke checks
- explicit mock demo mode
- direct compute flow
- public repo governance and security defaults

Still prototype / evolving:

- production deployment topology
- optional service integrations
- broader data-source coverage
- long-term contributor workflows and triage volume

## Architecture At A Glance

- `app/`: Next.js workbench UI and API routes
- `python/dcf_engine/`: valuation engine and FastAPI service
- `examples/`: sample request payloads for reproducible demos
- `docs/`: setup, architecture, security, and project notes

## Contributing

Contributor setup and verification guidance lives in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Package Note

`package.json` sets `"private": true` so this app is **not published to npm**. The repository is still open source under the MIT license.

## Documentation

- **Docs hub:** [`docs/README.md`](docs/README.md)
- Onboarding: [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Security: [`SECURITY.md`](SECURITY.md)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Roadmap: [`ROADMAP.md`](ROADMAP.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
