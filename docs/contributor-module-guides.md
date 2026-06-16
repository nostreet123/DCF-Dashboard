# Contributor Module Guides

These notes replace tracked `AGENTS.md` files for public contributors. Cursor Cloud and other agent environments may keep local `AGENTS.md` copies (see `.gitignore`); they are not part of the published source tree.

## Services (Local Development)

| Service | Port | Purpose |
|---------|------|---------|
| Next.js dev server | 3000 | Web UI and API routes |
| Python FastAPI DCF engine | 8000 | Core valuation compute |

Convex, Hugging Face, and SEC EDGAR are optional for local dev and tests.

> **Local development only.** Commands below use dev bypass flags (`DCF_ENGINE_ALLOW_UNSIGNED`, `DCF_RATE_LIMIT_ALLOW_LOCALHOST`). Never set these on hosted or public deployments. See [public-repo-audit-phase1.md](./public-repo-audit-phase1.md).

### Start Order

```bash
# Terminal 1 — Python engine
. .venv/bin/activate
DCF_ENGINE_ALLOW_UNSIGNED=1 PYTHONPATH=python python -m uvicorn dcf_engine.service.app:app --host 127.0.0.1 --port 8000

# Terminal 2 — Next.js
DCF_ENGINE_URL=http://127.0.0.1:8000 DCF_ENGINE_ALLOW_UNSIGNED=1 DCF_RATE_LIMIT_ALLOW_LOCALHOST=1 npm run dev
```

UI-only mock demo (no Python engine): `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev`

## Verification

See `README.md` and `package.json` scripts. Common commands:

- `npm run harness:verify` — invariants, tests, typecheck, lint, build
- `npm run lint` / `npm run typecheck`
- `scripts/ensure_bun.sh bun test` — JS/TS tests
- `. .venv/bin/activate && cd python && python -m pytest tests -q` — Python tests

## Canonical Code Boundaries

- **Convex server calls**: `app/api/_lib/convexServer.ts` only
- **Browser token auth**: `app/api/_lib/browserTokenAuth.ts` + `lib/browserImportTokens.ts`
- **Import context**: `lib/import/convexImportContext.ts`, `lib/import/redaction.ts`
- **Valuation decoders**: `lib/valuation/decoders.ts`
- **AI scenario analysis**: `lib/ai/scenarioAnalysis/*` with thin `app/api/ai/scenario-analysis/route.ts`
- **Dashboard controller**: `lib/hooks/dashboard/*` + `lib/dashboard/viewModel.ts`
- **Python valuation/sync**: `python/dcf_engine/valuation_kernel.py`, `python/dcf_engine/convex_transport.py`, `python/damodaran_sync/sync_*.py`

## Deeper Module Docs

- Convex schema and mutation patterns: `convex/schema.ts`, `convex/syncAuth.ts`, and tests under `convex/`
- DCF engine pipeline: `python/dcf_engine/engine.py`, `python/dcf_engine/docs/spec_fcff.md`
- Deploy security defaults: `DEPLOY_SECURITY_RUNBOOK.md`
