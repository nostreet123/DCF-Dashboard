# Contributing

Thanks for taking a look at DCF Dashboard.

## Before You Start

- Node `22.x` and npm `11.x` are the tested JavaScript toolchain
- Python `3.12+` is the tested backend/runtime toolchain
- `npm` is the canonical JavaScript package manager
- Bun is used only as the test runner behind the npm scripts

## Local Setup

```bash
nvm use
npm ci
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
```

## Golden Paths

- UI demo: `npm run dev`
- Direct compute demo: `npm run demo:compute`
- Repo alive smoke check: `npm run smoke:alive`

## Verification

Run the checks that match your change scope before opening a pull request.

```bash
npm test
npm run lint
npm run build
cd python && pytest
npx convex typecheck
```

## Pull Requests

- Keep changes focused and explain the user-visible impact
- Add or update tests when behavior changes
- Document new env vars, setup steps, or security assumptions
- Use conventional commit prefixes when possible, such as `feat:`, `fix:`, or `docs:`

## Issues

- Use the provided issue templates when possible
- For security-sensitive reports, follow [`SECURITY.md`](SECURITY.md) instead of opening a public bug
- If you are unsure whether a change belongs, start with a small issue or draft PR

## Project Scope

This repository is in public preview. Contributions that improve setup clarity, demo quality, valuation reproducibility, documentation, and safe defaults are especially helpful right now.
