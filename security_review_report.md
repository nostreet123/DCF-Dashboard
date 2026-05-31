# Security Review Report

Date: 2026-03-03 (original audit)

Reconciled: 2026-05-31 (public OSS readiness — PR 1)

## Reconciliation Status

This report captured the security posture **before** several hardening changes landed. Use it for historical context and open-risk tracking. For publish safety and current defaults, prefer:

- [docs/public-release-safety-gate0.md](docs/public-release-safety-gate0.md) — redacted secret/history verification
- [docs/public-repo-audit-phase1.md](docs/public-repo-audit-phase1.md) — public-safe vs local-only environment model
- [DEPLOY_SECURITY_RUNBOOK.md](DEPLOY_SECURITY_RUNBOOK.md) — hosted deployment checklist

| Original finding | Current status (2026-05-31) |
|------------------|----------------------------|
| FastAPI `/sec/*` reachable without auth when engine is public | **Open (deployment-dependent)** — keep engine private or add route-level controls before direct exposure |
| Public Convex valuation history reads | **Open (product decision)** — queries still optional-token; confirm intentional public summaries |
| FastAPI docs/OpenAPI enabled by default | **Remediated** — disabled unless `DCF_ENGINE_EXPOSE_DOCS=1` ([app.py](python/dcf_engine/service/app.py)) |
| `pull_request_target` secret exposure | **Remediated** — workflows use `pull_request` |
| Hardcoded secrets in reviewed paths | **No finding** — reaffirmed in Gate 0 |

## Executive Summary (Original)

This audit reviewed the public web/API surface in Next.js, the FastAPI DCF engine service, the Convex backend, and GitHub automation paths. The repo is materially stronger than a typical prototype: PR workflows use `pull_request` instead of `pull_request_target`, Convex write paths consistently gate mutations with `requireSyncToken()`, the internal persistence flow uses HMAC plus nonce replay protection, and the main request handlers sanitize client-facing error responses. The highest-priority remaining issues are around what happens if the FastAPI service is directly reachable and whether persisted valuation history is intended to be public.

## Scope Reviewed

- GitHub Actions and public-repo workflow posture under `.github/`
- Next.js route handlers under `app/api/`
- Next.js shared security helpers under `app/api/_lib/`
- Convex public queries and mutations under `convex/`
- FastAPI service entrypoints under `python/dcf_engine/service/`
- Automated hotspot scan across the above paths

## Findings

### Medium Severity

1. `python/dcf_engine/service/app.py` — **Medium** (Confidence: Medium)
   Description: The FastAPI service exposes `/sec/search` and `/sec/facts` with no authentication and no local abuse controls, while only `/dcf/compute` is rate limited. If the service behind `DCF_ENGINE_URL` is reachable outside the Next.js layer, an attacker can bypass the stronger Next.js request controls and hit the SEC-backed endpoints directly.
   Recommended fix: Keep the FastAPI service on a private network interface if possible. If it may ever be directly reachable, add route-level authentication or equivalent rate limiting to `/sec/search` and `/sec/facts`, not just `/dcf/compute`.

2. `convex/valuations.ts` — **Medium** (Confidence: Medium)
   Description: Persisted valuation summaries are readable through public Convex queries without authentication. The trace is protected, but `resultSummary`, status, symbol, date metadata, and other run metadata remain available to unauthenticated callers when browser/history features are enabled.
   Recommended fix: Decide whether valuation history is intended to be public. If not, require authenticated access for these queries or split public cache data from private run storage.

### Low Severity

3. `python/dcf_engine/service/app.py` — **Low** (Confidence: High) — **Remediated 2026-03+**
   Description: FastAPI documentation and the OpenAPI schema were enabled by default.
   Current behavior: `docs_url`, `redoc_url`, and `openapi_url` are `None` unless `DCF_ENGINE_EXPOSE_DOCS=1` (local/dev only). See [DEPLOY_SECURITY_RUNBOOK.md](DEPLOY_SECURITY_RUNBOOK.md).

## Positive Findings

- No hardcoded secrets were found by the hotspot scan (reaffirmed Gate 0, 2026-05-31).
- No SQL/NoSQL injection, command injection, or DOM XSS sinks identified in the original reviewed paths.
- Convex write paths reviewed in the original pass consistently enforce `requireSyncToken()` before mutating data.
- Internal persistence authorization uses HMAC signature, timestamp freshness, and replay-protected nonces.
- PR workflows use `pull_request`, not `pull_request_target`.

## Deployment-Dependent Notes

- Host header validation is not visible in the FastAPI app code; verify at the app or proxy layer before a public deployment.
- Next.js API rate limiting is fail-closed; effectiveness depends on deployment matching the configured identity source.

## Recommended Next Steps

1. Decide whether `python/dcf_engine/service/app.py` is private-only infrastructure or a potentially reachable service, then lock down `/sec/search` and `/sec/facts` accordingly.
2. Decide whether valuation history is public product data or private run data, then align `convex/valuations.ts` with that decision.
3. Keep `DCF_ENGINE_EXPOSE_DOCS` unset outside local/dev (already the code default).
