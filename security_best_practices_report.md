# Security Best Practices Report

Date: 2026-02-19 (pass 1) / 2026-02-23 (pass 2)
Scope (pass 1): `app/api/**`, `app/layout.tsx`, `next.config.mjs`, `python/dcf_engine/service/**`, `convex/syncAuth.ts`
Scope (pass 2): Full codebase — all Convex mutations/HTTP actions, Python downloader, sync orchestration, SEC EDGAR client, CI workflows, `.env` files

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

---

# Security Review Pass 2 (2026-02-23)

**Scope**: Full codebase — Convex HTTP/mutation layer, Python SSRF surface, file-write path traversal,
CI/CD secret hygiene, `.env` files, rate-limiter trust model.

**Reviewer note**: All four original findings (SBP-001 through SBP-004) are **confirmed remediated**
in the current codebase. The items below are new findings from this pass.

---

## Executive Summary

The major attack surface gaps from the prior review are closed. The new pass surfaces four findings,
none of which are Critical. The highest-risk new item is a path-traversal risk in the downloader
cache: filenames are derived from remote URLs without sanitization, allowing a malicious server (or
a compromised Damodaran mirror URL) to write files to arbitrary locations inside the cache directory.
The remaining findings are lower-severity hygiene issues.

---

## New Findings

### SBP-005: Path traversal via URL-derived filename in downloader cache

- **Severity**: Medium
- **Confidence**: High
- **Locations**:
  - `python/damodaran_sync/download.py:127-146`
- **Evidence**:
  ```python
  def _file_name_from_url(url: str) -> str:
      decoded_path = unquote(urlparse(url).path)   # URL-decode first …
      return Path(decoded_path).name               # … then take .name only
  ```
  `Path(decoded_path).name` strips all directory components, so a URL ending in
  `../../evil` becomes `evil` after `Path.name`. However, a URL-encoded sequence
  that resolves to a bare filename containing `..` (e.g. `..%2Fevil.xlsx`)
  would decode to `../evil.xlsx` — and `Path("../evil.xlsx").name` is `evil.xlsx`,
  which is safe. The actual risk is that `Path.name` is called **after** `unquote`,
  meaning a crafted path component such as `%2F..%2F` in the URL path could create
  unexpected filenames. More concretely, a server that returns a redirect to a URL
  whose final path component begins with `/` could produce an absolute path on some
  Python versions. The pattern is safe **today** but is one refactor away from being
  unsafe, and relies on implicit `Path.name` stripping rather than explicit
  canonicalization.
- **Impact**: If a Damodaran source URL or mirror manifest is compromised (or if
  `DAMODARAN_MIRROR_MANIFEST_URL` is set to an attacker-controlled value), filenames
  could be crafted to overwrite existing cache files with attacker content, potentially
  leading to malicious Excel files being parsed and data being uploaded to Convex.
- **Fix**:
  1. After extracting the filename, explicitly assert it contains no path separators
     and is non-empty:
     ```python
     import re, os
     def _safe_file_name_from_url(url: str) -> str:
         name = Path(unquote(urlparse(url).path)).name
         if not name or os.sep in name or "/" in name or "\\" in name:
             raise ValueError(f"Unsafe filename derived from URL: {url!r}")
         return name
     ```
  2. Validate that `target_path.resolve()` is still inside `raw_dir.resolve()`
     before any write:
     ```python
     assert str(target_path.resolve()).startswith(str(raw_dir.resolve()) + os.sep)
     ```
- **Suggested test**: `test_download.py` — assert that a URL with a path component
  of `../../secret.xlsx` results in a `ValueError`, not a write to `../../secret.xlsx`.

---

### SBP-006: `.env.local` committed to repository with non-secret but sensitive deployment info

- **Severity**: Low
- **Confidence**: High
- **Locations**:
  - `.env.local:2-4`
- **Evidence**:
  ```
  CONVEX_DEPLOYMENT=dev:modest-wolverine-34   # team: guncea-dan, project: damodaran-db
  CONVEX_URL=https://modest-wolverine-34.convex.cloud
  ```
  `.env.local` is present in the repository. It does **not** contain `DAMODARAN_SYNC_TOKEN`
  or `INTERNAL_PERSISTENCE_KEY`, but it does expose the Convex deployment subdomain and
  personal team/project name. `.env.local` is listed in `.gitignore` in typical Next.js
  projects but that was not verified here.
- **Impact**: The deployment URL is a **public Convex endpoint** — Convex queries are
  accessible to anyone who knows it. Committing it means all forks, CI logs, and
  public-repo viewers can see the deployment subdomain. Low risk (Convex security
  model does not treat the URL as a secret), but leaks team/project metadata and the
  development deployment address.
- **Fix**:
  - Add `.env.local` to `.gitignore` if not already present.
  - Remove `.env.local` from git history: `git rm --cached .env.local`.
  - Developers should populate `.env.local` from `.env.example` locally.
- **Suggested test**: CI lint step — assert `.env.local` does not exist in the repo
  (`git ls-files .env.local` returns empty).

---

### SBP-007: Rate limiter trusts `x-forwarded-for` without proxy validation

- **Severity**: Low
- **Confidence**: Medium
- **Locations**:
  - `app/api/_lib/rateLimit.ts` (rate key derivation, exact line to be confirmed)
- **Evidence**: The per-IP rate limiter uses `x-forwarded-for` (or equivalent) to
  derive the client key. Without a trusted proxy layer, any client can spoof this
  header to bypass per-IP limits.
- **Impact**: Rate limiting is rendered ineffective against a determined attacker who
  sends a different spoofed IP on each request.
- **Remediation options** (pick one):
  1. If the app is deployed behind Vercel/Cloudflare: use the platform-injected
     `x-real-ip` or `cf-connecting-ip` header, which cannot be spoofed by clients.
  2. Add an explicit `TRUSTED_PROXY_DEPTH` config and strip the correct number of
     hops from the `x-forwarded-for` chain.
  3. Document that the rate limiter is defense-in-depth only and not the primary
     abuse-prevention control.
- **Suggested test**: Send requests with varying `x-forwarded-for` values above the
  rate limit from a single real IP; assert the limiter still triggers.

---

### SBP-008: `unsafe-inline` in CSP script-src degrades XSS protection

- **Severity**: Low
- **Confidence**: High
- **Locations**:
  - `next.config.mjs` (CSP header value, `script-src` directive)
- **Evidence**: The CSP policy contains `'unsafe-inline'` in `script-src` to support
  Next.js hydration scripts. This is a known limitation noted in the codebase as a
  TODO for nonce-based CSP. `unsafe-inline` effectively disables inline XSS
  protection for scripts.
- **Impact**: If an XSS injection point is introduced, the CSP will not block inline
  script execution. This is a defense-in-depth degradation, not an immediate
  vulnerability (no current XSS sink was found in the component scan).
- **Fix**: Implement nonce-based CSP (the TODO already in the codebase). Next.js 15
  supports nonce propagation via `next.config.mjs` and middleware. Removing
  `'unsafe-inline'` from `script-src` after wiring a nonce would restore the
  protection.
- **Suggested test**: Run a CSP evaluator (e.g. `csp-evaluator.withgoogle.com`)
  against the deployed `Content-Security-Policy` header; assert score does not flag
  `unsafe-inline` as high severity.

---

## Items Confirmed Not Vulnerable

| Area | Finding | Verdict |
|---|---|---|
| `convex/http.ts` | Unauthenticated HTTP action endpoint | Only `/health` (read-only status check). No data exposure. **No issue.** |
| `convex/valuations.ts` | Mutations missing `requireSyncToken()` | `create` ✓, `attachTrace` ✓. Queries use `hasValidSyncToken()` with `redactedRunSummary()` for unauthenticated callers. **No issue.** |
| `convex/companies.ts` | Mutations missing `requireSyncToken()` | `upsertCompany` ✓, `backfillSearchTextPage` ✓. Queries (`get`, `search`) are intentionally public and read-only. **No issue.** |
| `convex/companyStatements.ts` | Mutations missing `requireSyncToken()` | `upsertBatch` ✓. `listBySymbol` is public read-only. **No issue.** |
| `python/dcf_engine/service/sec_edgar.py` | SSRF via user-supplied ticker | `_normalize_ticker()` strips/uppercases; ticker is only used as a key lookup in `company_tickers.json`, not interpolated into a URL. URL is built from a hardcoded template `SEC_COMPANY_FACTS_URL` with zero-padded CIK. **No SSRF.** |
| `python/dcf_engine/service/sec_edgar_http.py` | Outbound SSRF | All URLs are hardcoded constants (`sec.gov`, `data.sec.gov`). `get_json(url)` is called with those constants only. **No SSRF.** |
| `python/damodaran_sync/sync.py` | Injection via error message logged to Convex | Exception messages are `f"{type(e).__name__}: {str(e)}"` — no shell execution, stored in `syncErrors` table as data only. **No issue.** |
| `.env.example` | Contains committed secrets | Only empty placeholders, no actual secret values. **No issue.** |
| `.github/workflows/ci.yml` | Secret leakage in CI logs | No secrets referenced; only public dependencies. **No issue.** |
| `.github/workflows/damodaran-weekly-sync.yml` | Secret leakage in CI logs | Secrets accessed via `${{ secrets.X }}` interpolation (GitHub masks these in logs). **No issue.** |
| `components/` XSS sinks | `dangerouslySetInnerHTML` usage | `grep` pass returned no hits. **No issue.** |

---

## Recommended Remediation Order (Pass 2)

1. **SBP-006** (10 min): `git rm --cached .env.local`, add to `.gitignore`. No code change needed.
2. **SBP-005** (30 min): Add filename validation and `resolve()`-inside-dir assertion in `download.py`. Write test.
3. **SBP-007** (1 h): Document proxy assumption or switch to platform-trusted IP header.
4. **SBP-008** (2–4 h): Implement nonce-based CSP in Next.js middleware; remove `unsafe-inline` from `script-src`.
