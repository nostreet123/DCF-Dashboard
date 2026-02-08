# Bug Hunt Report - 2026-02-08

## Scope
- Goal: Release blocker sweep
- Scope: Whole stack (Next API, Convex, Python)
- Aggression: High-chaos fault injection (non-destructive)
- Environments: Local execution with staging-safe assumptions
- Exit gate: Zero open P0/P1

## Baseline Results
- `npm test`: pass
- `bun run test:convex`: pass
- `bunx convex typecheck`: pass
- `.venv/bin/python -m pytest`: pass (84 tests)

## Findings

| ID | Severity | Layer | File | Issue | Status | Test Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| BH-2026-02-08-01 | P1 | Next API shared lib | `app/api/_lib/convex.ts` | Import-time throw on missing `CONVEX_URL` could crash routes before request handling and bypass best-effort debug behavior. | Fixed | Added `test/convexConfig.test.ts` |
| BH-2026-02-08-02 | P1 | Convex query runtime | `convex/companies.ts` | `companies:search` used repeated `paginate()` calls in one function; this crashes in Convex runtime with "multiple paginated queries". | Fixed + deployed | Live probe on dev/prod |
| BH-2026-02-08-03 | P1 | Convex prod config | Convex env (`original-finch-851`) | `DAMODARAN_SYNC_TOKEN` missing in prod deployment env caused mutation auth failures (observed via `debugEvents:append` probe). | Fixed | Env updated + live probe |

## Fix Summary
- Converted Convex client initialization from eager module import to lazy call-time resolution.
- Added call-time env validation (`CONVEX_URL`) with client caching keyed by URL.
- Preserved existing token validation behavior in `getSyncToken()`.
- Reworked `companies:search` to use a single indexed read (`take`) and in-memory filtering, removing unsupported multi-`paginate` behavior.
- Deployed Convex functions to both prod (`original-finch-851`) and dev (`modest-wolverine-34`) to verify runtime behavior.

## Verification
- New test confirms `queryConvex()` and `mutateConvex()` now fail with explicit config error at call-time instead of module-load crash.
- Existing Node, Convex, and Python suites pass after fix.
- Live probe confirms `companies:search` no longer crashes on both prod and dev deployments.
- Live probe on dev confirms mutation auth behavior: invalid token returns `UNAUTHORIZED`.
- Live probe on prod shows missing env configuration: Convex error data reports `Missing DAMODARAN_SYNC_TOKEN`.
- After setting prod `DAMODARAN_SYNC_TOKEN`, live probe confirms expected auth behavior on prod: invalid token returns `UNAUTHORIZED`, valid token succeeds.

## Residual Risks
- Node test runner still warns on package module type (`MODULE_TYPELESS_PACKAGE_JSON`). This is non-blocking but should be standardized later.
- Route-level tests that import `next/server` directly remain constrained by current test runner; helper-level tests remain the practical strategy.
- No open release-blocking config gaps found after token provisioning and probe verification.

## Closure
- Open P0: 0
- Open P1: 0
- Hunt status: Passed exit gate for this cycle.
