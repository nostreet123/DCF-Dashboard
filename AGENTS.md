# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Port | Purpose |
|---------|------|---------|
| Next.js dev server | 3000 | Web UI and API routes |
| Python FastAPI DCF engine | 8000 | Core valuation compute |

Convex, Hugging Face, and SEC EDGAR are optional and not needed for local dev/test.

### Running services

Start the Python engine first, then Next.js. Both need `DCF_ENGINE_ALLOW_UNSIGNED=1` for local dev:

```bash
# Terminal 1 — Python engine
. .venv/bin/activate
DCF_ENGINE_ALLOW_UNSIGNED=1 PYTHONPATH=python python -m uvicorn dcf_engine.service.app:app --host 127.0.0.1 --port 8000

# Terminal 2 — Next.js
DCF_ENGINE_URL=http://127.0.0.1:8000 DCF_ENGINE_ALLOW_UNSIGNED=1 DCF_RATE_LIMIT_ALLOW_LOCALHOST=1 npm run dev
```

For a UI-only mock demo (no Python engine needed): `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev`

### Verification commands

See `README.md` and `package.json` scripts for the full list. Key ones:

- **Full harness**: `npm run harness:verify` (runs invariants, bun tests, pytest, typecheck, convex typecheck, lint, build)
- **Lint**: `npm run lint`
- **Typecheck**: `npm run typecheck`
- **JS/TS tests**: `bun test` (Bun is auto-installed to `.bun-home/` by `scripts/ensure_bun.sh` if missing)
- **Python tests**: `. .venv/bin/activate && cd python && python -m pytest tests -q`
- **Build**: `npm run build`

### Gotchas

- `npm` is the canonical JS package manager (not pnpm/yarn). The repo pins `npm@11.6.2` via `packageManager` field.
- Bun is used **only** as the test runner; `scripts/ensure_bun.sh` installs it to `.bun-home/` if not on PATH. Add `.bun-home/bin` to PATH or use `scripts/ensure_bun.sh bun test` to run tests.
- Python venv must be at `.venv` — the harness scripts auto-detect `.venv/bin/python`.
- `python3.12-venv` system package is required to create the venv on Ubuntu.
- The `DCF_ENGINE_ALLOW_UNSIGNED=1` env var is required for local FastAPI requests (signature verification is on by default).
- `DCF_RATE_LIMIT_ALLOW_LOCALHOST=1` bypasses rate limiting for localhost dev.
