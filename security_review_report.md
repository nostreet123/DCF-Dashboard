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
| FastAPI `/sec/*` reachable without auth when engine is public | **Remediated (2026-03+)** — `/sec/search` and `/sec/facts` use `Depends(require_internal_request)` ([app.py](python/dcf_engine/service/app.py)); unsigned access only with `DCF_ENGINE_ALLOW_UNSIGNED=1` and no `DCF_ENGINE_INTERNAL_KEY` |
| Public Convex valuation history reads | **Remediated (2026-03+)** — `valuations.ts` read queries call `requireValuationReadAccess()` (requires `DAMODARAN_SYNC_TOKEN`); optional browser routes stay behind explicit `VALUATION_HISTORY_BROWSER_READS` + server token gates |
| FastAPI docs/OpenAPI enabled by default | **Remediated** — disabled unless `DCF_ENGINE_EXPOSE_DOCS=1` ([app.py](python/dcf_engine/service/app.py)) |
| `pull_request_target` secret exposure | **Remediated** — workflows use `pull_request` |
| Hardcoded secrets in reviewed paths | **No finding** — reaffirmed in Gate 0 |

## Executive Summary (Original)

This audit reviewed the public web/API surface in Next.js, the FastAPI DCF engine service, the Convex backend, and GitHub automation paths. The repo is materially stronger than a typical prototype: PR workflows use `pull_request` instead of `pull_request_target`, Convex write paths consistently gate mutations with `requireSyncToken()`, the internal persistence flow uses HMAC plus nonce replay protection, and the main request handlers sanitize client-facing error responses. The highest-priority remaining issues at audit time were around direct FastAPI reachability and unauthenticated valuation history reads; both have since been hardened (see reconciliation table).

## Scope Reviewed

- GitHub Actions and public-repo workflow posture under `.github/`
- Next.js route handlers under `app/api/`
- Next.js shared security helpers under `app/api/_lib/`
- Convex public queries and mutations under `convex/`
- FastAPI service entrypoints under `python/dcf_engine/service/`
- Automated hotspot scan across the above paths

## Findings

### Medium Severity (original audit; see reconciliation for current status)

1. `python/dcf_engine/service/app.py` — **Medium** (original)
   Description (2026-03-03): The FastAPI service exposed `/sec/search` and `/sec/facts` without authentication while only `/dcf/compute` was rate limited.
   **Current (2026-05-31): Remediated.** Both routes require `require_internal_request` (HMAC signature + nonce replay protection) unless the local-only unsigned opt-in is active. Residual risk: a publicly reachable engine with a leaked `DCF_ENGINE_INTERNAL_KEY` — keep the engine private and rotate keys on compromise.

2. `convex/valuations.ts` — **Medium** (original)
   Description (2026-03-03): Persisted valuation summaries were readable through Convex queries without authentication.
   **Current (2026-05-31): Remediated.** Read queries use `requireValuationReadAccess()` which calls `requireSyncToken()`. Residual risk: enabling `VALUATION_HISTORY_BROWSER_READS` / browser token routes without understanding data exposure — leave those flags unset in public demos.

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
- Hosted signed FastAPI mode requires Convex-backed nonce storage; unsigned or process-local modes are local-only escape hatches.

## Recommended Next Steps

1. Keep the FastAPI engine on a private network or behind Next.js unless operational needs require direct exposure.
2. Leave `VALUATION_HISTORY_BROWSER_READS` and related browser tokens unset unless saved runs are intentionally public.
3. Keep `DCF_ENGINE_EXPOSE_DOCS`, `DCF_ENGINE_ALLOW_UNSIGNED`, and `DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES` unset outside local/dev (already the documented default).
