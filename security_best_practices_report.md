# Security Best Practices Report

Date: 2026-02-19  
Scope: `app/api/**`, `app/layout.tsx`, `next.config.mjs`, `python/dcf_engine/service/**`, `convex/syncAuth.ts`

## Executive Summary

I reviewed the Next.js API layer, Convex mutation boundary, and FastAPI service surfaces using the `security-best-practices` guidance for Next.js/React frontend and Python FastAPI backend.

The highest-risk issue is that public Next.js API endpoints can perform privileged Convex writes using the server-side `DAMODARAN_SYNC_TOKEN` without request authentication. This creates an external write primitive into internal data stores and can be abused for data poisoning and storage/cost amplification.

## Critical Findings

### 1) SBP-001: Unauthenticated public endpoints perform privileged Convex writes
- Severity: Critical
- Impact statement: Any internet caller can trigger server-authorized database mutations, enabling unauthorized data writes and cost amplification.
- Rule alignment: Next.js backend authz boundary enforcement for state-changing endpoints.
- Locations:
  - `app/api/dcf/run/route.ts:12`
  - `app/api/dcf/run/route.ts:54`
  - `app/api/dcf/run/route.ts:87`
  - `app/api/company/facts/route.ts:29`
  - `app/api/company/facts/route.ts:50`
  - `app/api/company/facts/route.ts:64`
  - `app/api/company/facts/route.ts:88`
  - `app/api/_lib/convex.ts:29`
- Evidence:
  - Both routes accept public requests and do not enforce authn/authz checks.
  - They retrieve `syncToken` from server env via `getSyncTokenOptional()` and pass it directly into Convex mutations.
- Impact:
  - Unauthorized external callers can create/modify records (`valuationRuns`, `companies`, `companyStatements`) through backend-side privileged credentials.
  - Attackers can repeatedly invoke heavy operations (`/dcf/compute` + persistence) to inflate storage/compute costs and degrade service.
- Fix:
  - Add explicit authorization at route entry for any endpoint that can write or trigger expensive side effects.
  - Prefer a dedicated internal API key or signed HMAC header for machine callers.
  - Optionally split public compute from persistence, and gate persistence behind an internal-only endpoint.
- Mitigation (interim):
  - Restrict access at edge/proxy by IP allowlist for internal callers.
  - Add request quotas/rate limits immediately.
- False-positive notes:
  - If these routes are already protected by an external gateway/WAF auth layer, verify and document that control in-repo.

## High Findings

### 2) SBP-002: `GET /api/company/facts` has write side effects
- Severity: High
- Rule alignment: Safe HTTP method semantics; avoid state-changing behavior on unauthenticated GET.
- Locations:
  - `app/api/company/facts/route.ts:29`
  - `app/api/company/facts/route.ts:64`
  - `app/api/company/facts/route.ts:88`
- Evidence:
  - The route is implemented as `GET` but executes `companies:upsertCompany` and `companyStatements:upsertBatch` mutations.
- Impact:
  - Crawlers, prefetchers, link previews, and cross-site GET requests can trigger writes unintentionally.
  - Increases risk of unauthorized or accidental state changes and backend load spikes.
- Fix:
  - Make `GET` read-only.
  - Move persistence to an authenticated `POST`/internal job endpoint.
- Mitigation (interim):
  - Disable prefetch for this route and enforce strict cache controls.
  - Add server-side rate limiting and authentication checks before mutation calls.
- False-positive notes:
  - Even idempotent upserts are still side effects and should not be on public GET.

## Medium Findings

### 3) SBP-003: Internal error details are reflected to external clients
- Severity: Medium
- Rule alignment: Error handling should avoid leaking internal details.
- Locations:
  - `python/dcf_engine/service/app.py:26`
  - `python/dcf_engine/service/app.py:36`
  - `python/dcf_engine/service/app.py:39`
  - `python/dcf_engine/service/app.py:48`
  - `python/dcf_engine/service/app.py:51`
  - `app/api/_lib/dcfEngine.ts:55`
  - `app/api/_lib/dcfEngine.ts:60`
  - `app/api/dcf/run/route.ts:49`
  - `app/api/company/facts/route.ts:45`
  - `app/api/company/search/route.ts:60`
- Evidence:
  - FastAPI raises `HTTPException(..., detail=str(exc))` directly from caught exceptions.
  - Next.js proxy surfaces `error.message` from upstream and may include response body text.
- Impact:
  - Reveals internal error context, backend behavior, and operational details useful for reconnaissance.
- Fix:
  - Return standardized external error messages (e.g., `EDGAR_ERROR`, `DCF_ENGINE_ERROR`) without raw exception text.
  - Log full details server-side with correlation IDs.
- Mitigation (interim):
  - Strip/normalize upstream error text at `fetchDcfEngine` boundary before returning responses.
- False-positive notes:
  - Current behavior can be useful in development; keep verbose errors behind a non-production debug flag.

### 4) SBP-004: No in-repo baseline security headers/CSP configuration is visible
- Severity: Medium
- Rule alignment: Frontend/browser defense-in-depth baseline.
- Locations:
  - `next.config.mjs:1`
  - `next.config.mjs:2`
  - `app/layout.tsx:25`
- Evidence:
  - `next.config.mjs` only sets `reactStrictMode` and no response headers.
  - Inline script is injected via `dangerouslySetInnerHTML` in layout, but no visible nonce/hash-based CSP policy in app code.
- Impact:
  - Reduced defense-in-depth against XSS/clickjacking/content-type confusion if edge headers are not set elsewhere.
- Fix:
  - Configure CSP and baseline security headers at Next.js or edge/CDN layer.
  - Use nonce/hash strategy compatible with required inline bootstrap script.
- Mitigation (interim):
  - Verify runtime headers in deployed environment and document ownership/source of those controls.
- False-positive notes:
  - Headers may already be set by infrastructure outside this repo; confirm at runtime.

## Recommended Remediation Order

1. Fix SBP-001 first: add authentication/authorization gates before any mutation-capable route code paths.
2. Fix SBP-002 next: make `GET /api/company/facts` read-only and move writes to authenticated POST/internal workflow.
3. Fix SBP-003: replace client-facing raw exception text with generic messages and correlation IDs.
4. Fix SBP-004: add and verify security headers/CSP baseline.

## Suggested Verification Checks

- Attempt unauthenticated calls to `/api/dcf/run` and `/api/company/facts` from a clean client; verify mutations are rejected post-fix.
- Confirm no state changes occur via `GET` endpoints.
- Validate API error responses no longer include raw backend exception strings.
- Verify deployed response headers include CSP and baseline hardening headers.

## Remediation Status (2026-02-19)

- SBP-001: Implemented.
  - Added internal auth guard using `x-dcf-internal-key` and `INTERNAL_PERSISTENCE_KEY`: `app/api/_lib/internalAuth.ts`.
  - Applied guard before persistence in `app/api/dcf/run/route.ts` and `app/api/company/facts/route.ts`.
- SBP-002: Implemented.
  - `GET /api/company/facts` is read-only.
  - Persistence moved to authenticated `POST /api/company/facts`.
- SBP-003: Implemented.
  - Next.js routes now return generic upstream failure messages and log detailed errors server-side.
  - FastAPI routes now return sanitized `detail` values for 400/404/500 paths.
- SBP-004: Implemented.
  - Added production security headers and CSP in `next.config.mjs`.
  - Removed inline theme script from `app/layout.tsx` and moved logic to `public/theme-init.js`.
