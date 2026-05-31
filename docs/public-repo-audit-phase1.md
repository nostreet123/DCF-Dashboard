# Public Repo Audit - Phase 1

Date: 2026-05-31 (Gate 0 re-verification)

Status: PASS on current `main` tree and `main` lineage; complete GitHub settings preflight before public switch

## Executive Summary

Gate 0 re-verified the publishable tree and the `main` / `origin/main` ref lineage. No committed secrets, tracked `.env` files, or live deployment metadata were found. Historical Convex deployment metadata existed only in a removed report on **non-`main` refs**; it is not reachable from current `main`. See [public-release-safety-gate0.md](./public-release-safety-gate0.md) for the redacted scan summary (tool, scope, ref coverage, zero-finding status, evidence hash). Raw scanner output is never committed.

## Secret Scan Summary

Reviewed (2026-05-31):

- `.env*` files and committed config
- Next.js, Convex, and FastAPI entry points
- GitHub Actions workflows
- Tests, fixtures, and sample data
- `main` and `origin/main` history for tokens, API keys, private keys, and real Convex deployment identifiers

Confirmed findings:

- No committed values for `DAMODARAN_SYNC_TOKEN`, `CONVEX_DEPLOY_KEY`, `DCF_ENGINE_INTERNAL_KEY`, or `INTERNAL_PERSISTENCE_KEY`
- No tracked `.env` or `.env.local` files
- No private key material or common live API key formats on the `main` lineage
- Prior `security_best_practices_report.md` metadata leak is absent from `main` / `origin/main` (stale `pull/*` refs may still exist on the host — see Gate 0 follow-ups)

Redacted evidence: [public-release-safety-gate0.md](./public-release-safety-gate0.md)

## Safe Public Defaults Pass

Implemented:

- FastAPI internal auth is fail-closed by default
- Unsigned FastAPI access requires explicit local-only opt-in via `DCF_ENGINE_ALLOW_UNSIGNED=1`
- Next.js refuses unsigned FastAPI calls unless that same local-only opt-in is set
- FastAPI `/docs`, `/redoc`, and `/openapi.json` are **disabled unless** `DCF_ENGINE_EXPOSE_DOCS=1` (local/dev only)
- `.env.example` groups public-safe, private operational, server-only secret, and local-only unsafe sections
- Tracked `AGENTS.md` files removed from the publishable tree; public contributor guidance lives in [contributor-module-guides.md](./contributor-module-guides.md)

Residual deployment note:

- Signed FastAPI routes fail closed with `503` when Convex-backed shared nonce storage is not configured (`CONVEX_URL` + `DAMODARAN_SYNC_TOKEN`). Process-local nonces are available only with explicit `DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES=1` (local/dev). Hosted multi-worker deployments must use the shared Convex nonce store.

## Variables Safe For Public Documentation

Safe to mention in docs or browser-exposed config when appropriate:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_DCF_DASHBOARD_MODE`
- `TABLEDATA_INSERT_MAX_ROWS`
- `DAMODARAN_INSERT_BATCH_MAX_ROWS`
- `DAMODARAN_INSERT_BATCH_MAX_BYTES`
- `DAMODARAN_RATE_LIMIT_SECONDS`
- `DAMODARAN_MIRROR_MANIFEST_URL`
- `DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED`
- `DAMODARAN_SNAPSHOT_BATCH_SIZE`
- `DAMODARAN_SYNC_WORKERS`
- `DAMODARAN_CONDITIONAL_GET`
- `RATE_LIMIT_IDENTITY_SOURCE`
- `RATE_LIMIT_IDENTITY_MODE`
- `DCF_TRUSTED_PROXY_MODE`
- `MONTE_CARLO_DEPENDENCE`
- `MONTE_CARLO_ONE_FACTOR_LOADING`

## Local-Only Flags (Never Hosted/Public Defaults)

Do **not** document these as safe defaults for public or shared deployments:

- `DCF_ENGINE_ALLOW_UNSIGNED`
- `DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES`
- `DCF_RATE_LIMIT_ALLOW_LOCALHOST`
- `DCF_ENGINE_EXPOSE_DOCS`
- `IMPORT_APPROVAL_BROWSER_WRITES`

## Variables Never To Expose

- `CONVEX_DEPLOY_KEY`
- `DAMODARAN_SYNC_TOKEN`
- `DCF_ENGINE_INTERNAL_KEY`
- `INTERNAL_PERSISTENCE_KEY`
- `HUGGING_FACE_API_KEY`

## Sensitive But Not Secret

Do not use real deployment values in public examples:

- `CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `DCF_ENGINE_URL`
- `DCF_TRUSTED_PROXY_CIDRS`
- `SEC_USER_AGENT`

## Release Steps (Maintainer)

Before making the repository public:

1. Complete GitHub settings preflight in [public-release-safety-gate0.md](./public-release-safety-gate0.md)
2. Merge OSS readiness PRs 1–8 in order
3. Run final secret/history scan (PR 8 checklist)
4. Switch visibility to public

## Pass Condition

This phase passes when all of the following are true:

- Current tree contains no secrets or sensitive deployment metadata
- `main` lineage no longer contains the removed report leak
- Public deployments keep local-only bypass flags unset
- Operational secrets remain in environment stores only
- Redacted Gate 0 evidence is recorded and raw scanner output is not published
