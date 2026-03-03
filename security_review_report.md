# Security Review Report

Date: 2026-03-03

## Executive Summary

This audit reviewed the public web/API surface in Next.js, the FastAPI DCF engine service, the Convex backend, and the GitHub automation paths. The repo is materially stronger than a typical prototype: PR workflows use `pull_request` instead of `pull_request_target`, Convex write paths consistently gate mutations with `requireSyncToken()`, the internal persistence flow uses HMAC plus nonce replay protection, and the main request handlers sanitize client-facing error responses. The highest-priority remaining issues are around what happens if the FastAPI service is directly reachable and whether persisted valuation history is intended to be public.

## Scope Reviewed

- GitHub Actions and public-repo workflow posture under `.github/`
- Next.js route handlers under `app/api/`
- Next.js shared security helpers under `app/api/_lib/`
- Convex public queries and mutations under `convex/`
- FastAPI service entrypoints under `python/dcf_engine/service/`
- Quick hotspot scan via `python3 .agents/skills/code-security-review/scripts/quick_scan.py /root/DCF-Dashboard --output json`

## Findings

### Medium Severity

1. `python/dcf_engine/service/app.py:145` — **Medium** (Confidence: Medium)
   Description: The FastAPI service exposes `/sec/search` and `/sec/facts` with no authentication and no local abuse controls, while only `/dcf/compute` is rate limited. If the service behind `DCF_ENGINE_URL` is reachable outside the Next.js layer, an attacker can bypass the stronger Next.js request controls and hit the SEC-backed endpoints directly.
   Evidence: `sec_search()` and `sec_facts()` are public GET routes at [app.py](/root/DCF-Dashboard/python/dcf_engine/service/app.py#L145) and [app.py](/root/DCF-Dashboard/python/dcf_engine/service/app.py#L158) with no auth or limiter call, while `dcf_compute()` explicitly calls `_enforce_dcf_rate_limit()` at [app.py](/root/DCF-Dashboard/python/dcf_engine/service/app.py#L175). The public Next.js proxies do apply rate limiting in [route.ts](/root/DCF-Dashboard/app/api/company/search/route.ts#L12) and [route.ts](/root/DCF-Dashboard/app/api/company/facts/route.ts#L104), so the missing control is specific to direct FastAPI access.
   Recommended fix: Keep the FastAPI service on a private network interface if possible. If it may ever be directly reachable, add route-level authentication or equivalent rate limiting to `/sec/search` and `/sec/facts`, not just `/dcf/compute`.
   Suggested test: Add an integration test that exercises the FastAPI service directly and verifies repeated `/sec/search` or `/sec/facts` requests receive `429`, or that requests without an expected internal credential receive `401/403`.

2. `convex/valuations.ts:254` — **Medium** (Confidence: Medium)
   Description: Persisted valuation summaries are readable through public Convex queries without authentication. The trace is protected, but `resultSummary`, status, symbol, date metadata, and other run metadata remain available to unauthenticated callers.
   Evidence: `get`, `listBySymbol`, and `listByTicker` accept only an optional `syncToken` and return redacted summaries for unauthenticated callers at [valuations.ts](/root/DCF-Dashboard/convex/valuations.ts#L254), [valuations.ts](/root/DCF-Dashboard/convex/valuations.ts#L295), and [valuations.ts](/root/DCF-Dashboard/convex/valuations.ts#L333). The redaction helper only removes `inputs`, provenance-like fields, request ID, and trace metadata, leaving `resultSummary` intact. The client consumes these queries directly with `useQuery(...)` and no auth token in [useValuationHistory.ts](/root/DCF-Dashboard/lib/hooks/useValuationHistory.ts#L37) and [useValuationHistory.ts](/root/DCF-Dashboard/lib/hooks/useValuationHistory.ts#L55). Persisted summaries are created from actual computed valuations in [route.ts](/root/DCF-Dashboard/app/api/dcf/run/route.ts#L108).
   Recommended fix: Decide whether valuation history is intended to be public. If not, require authenticated access for these queries or split public cache data from private run storage. If some history is meant to be public, explicitly publish only approved fields instead of returning the general `valuationRuns` shape.
   Suggested test: Add a Convex test asserting that an unauthenticated client cannot read `resultSummary` from `listByTicker`, `listBySymbol`, or `get`.

### Low Severity

3. `python/dcf_engine/service/app.py:17` — **Low** (Confidence: High)
   Description: FastAPI documentation and the OpenAPI schema are enabled by default. If the DCF engine service is deployed on a public hostname, `/docs`, `/redoc`, and `/openapi.json` will expose route inventory and schemas to unauthenticated users.
   Evidence: The app is instantiated with defaults at [app.py](/root/DCF-Dashboard/python/dcf_engine/service/app.py#L17), and there is no visible override for `docs_url`, `redoc_url`, or `openapi_url` in the reviewed code.
   Recommended fix: Disable these endpoints in production with `FastAPI(docs_url=None, redoc_url=None, openapi_url=None)` or put them behind network/auth controls.
   Suggested test: In production configuration, assert `GET /docs`, `GET /redoc`, and `GET /openapi.json` return `404` or are blocked upstream.

## Positive Findings

- No hardcoded secrets were found by the hotspot scan.
- I did not find SQL/NoSQL injection, command injection, or DOM XSS sinks in the reviewed application paths.
- Convex write paths reviewed in this pass consistently enforce `requireSyncToken()` before mutating data.
- The internal persistence authorization path uses an HMAC signature, timestamp freshness, and replay-protected nonces in `app/api/_lib/internalAuth.ts`.
- The PR workflows in `.github/workflows/` use `pull_request`, not `pull_request_target`, reducing the common public-repo PR secret-exposure risk.

## Deployment-Dependent Notes

- Host header validation (`TrustedHostMiddleware` or equivalent) is not visible in the FastAPI app code. This is not a confirmed vulnerability from code alone, but it should be verified at the app or proxy layer before a public deployment.
- The Next.js API rate limiter is fail-closed and uses trusted proxy headers carefully; however, its effectiveness depends on the deployment matching the configured identity source.

## Sources Used

- Convex public-function and access-control guidance: https://docs.convex.dev/understanding/best-practices
- Convex function auth guidance: https://docs.convex.dev/auth/functions-auth
- Convex public HTTP API guidance: https://docs.convex.dev/http-api/
- FastAPI docs/OpenAPI configuration: https://fastapi.tiangolo.com/tutorial/metadata/

## Recommended Next Steps

1. Decide whether `python/dcf_engine/service/app.py` is private-only infrastructure or a potentially reachable service, then lock down `/sec/search` and `/sec/facts` accordingly.
2. Decide whether valuation history is public product data or private run data, then align `convex/valuations.ts` with that decision.
3. Disable or protect FastAPI docs/OpenAPI before any public deployment.
