# Deploy Security Runbook

This runbook covers the security-sensitive rollout steps for the internal Next.js -> FastAPI auth boundary and the private-by-default valuation history changes.

## Purpose

Use this checklist when deploying changes that depend on:

- `DCF_ENGINE_INTERNAL_KEY`
- `DCF_ENGINE_EXPOSE_DOCS`
- `INTERNAL_PERSISTENCE_KEY`
- `CONVEX_URL`
- `DAMODARAN_SYNC_TOKEN`
- `SEC_USER_AGENT`

The goal is to avoid:

- breaking Next.js -> FastAPI traffic because signing is misconfigured
- accidentally leaving FastAPI directly callable without auth
- accidentally starting FastAPI signed mode without Convex-backed shared security state
- exposing FastAPI docs in non-dev environments
- unintentionally enabling or disabling Convex-backed persistence paths

## Secret Model

These secrets serve different roles and should remain distinct:

- `DCF_ENGINE_INTERNAL_KEY`
  - Shared HMAC secret for **Next.js -> FastAPI** internal requests.
  - Must be identical in the Next.js runtime and the FastAPI runtime.
- `INTERNAL_PERSISTENCE_KEY`
  - Shared HMAC secret for **privileged inbound requests to Next.js** routes that can persist data.
  - Do not reuse this as the FastAPI engine secret.
- `DAMODARAN_SYNC_TOKEN`
  - Server-side token used by Next.js/Python services when mutating Convex.

## Required Environment Variables

### Next.js runtime

- `DCF_ENGINE_URL`
- `DCF_ENGINE_INTERNAL_KEY`
- `CONVEX_URL`
- `DAMODARAN_SYNC_TOKEN` if persistence is expected
- `INTERNAL_PERSISTENCE_KEY` if privileged internal Next.js routes are used

### FastAPI runtime

- `DCF_ENGINE_INTERNAL_KEY`
- `CONVEX_URL`
- `DAMODARAN_SYNC_TOKEN`
- `SEC_USER_AGENT`
- `DCF_TRUSTED_PROXY_MODE` and `DCF_TRUSTED_PROXY_CIDRS` if proxy trust is needed
- Leave `DCF_ENGINE_EXPOSE_DOCS` unset in staging/production

### Client/browser-exposed runtime

- `NEXT_PUBLIC_CONVEX_URL` only when the frontend needs Convex-backed reads

## Rollout Order

1. Prepare the new `DCF_ENGINE_INTERNAL_KEY`.
   - Generate a fresh secret.
   - Do not reuse `INTERNAL_PERSISTENCE_KEY`.

2. Update staging environment variables.
   - Set `DCF_ENGINE_INTERNAL_KEY` in both Next.js and FastAPI.
   - Confirm the values match exactly.
   - Set `CONVEX_URL` and `DAMODARAN_SYNC_TOKEN` in FastAPI.
   - Confirm `SEC_USER_AGENT` is present for FastAPI.
   - Confirm `DCF_ENGINE_EXPOSE_DOCS` is unset.

3. Deploy Next.js first.
   - This ensures outbound signing support is live before FastAPI starts enforcing it.

4. Deploy FastAPI second.
   - Once FastAPI is live with `DCF_ENGINE_INTERNAL_KEY`, unsigned direct requests should fail with `401`.

5. Deploy any Convex/runtime updates together with the application rollout if your environment requires it.
   - Valuation history reads are now token-gated server-side.

## Staging Smoke Tests

Run these after deployment.

### Expected to work through Next.js

- `GET /api/company/search?q=AAPL`
- `GET /api/company/facts?symbol=AAPL`
- `POST /api/dcf/preview`
- `POST /api/dcf/run`

### Expected to fail when called directly against FastAPI without signed headers

- `GET /sec/search?q=AAPL&limit=10` -> `401`
- `GET /sec/facts?symbol=AAPL` -> `401`
- `POST /dcf/compute` -> `401`

### Expected to fail when FastAPI signed mode lacks Convex-backed shared security state

- `POST /dcf/compute` -> `503`
- `GET /sec/search?q=AAPL&limit=10` with valid signed headers -> `503`

### Expected docs behavior in non-dev

- `GET /docs` -> `404`
- `GET /redoc` -> `404`
- `GET /openapi.json` -> `404`

## Production Rollout Checklist

- [ ] `DCF_ENGINE_INTERNAL_KEY` is set in both Next.js and FastAPI
- [ ] `DCF_ENGINE_INTERNAL_KEY` values match exactly
- [ ] `DCF_ENGINE_INTERNAL_KEY` is different from `INTERNAL_PERSISTENCE_KEY`
- [ ] `CONVEX_URL` is set in FastAPI
- [ ] `DAMODARAN_SYNC_TOKEN` is set in FastAPI
- [ ] `SEC_USER_AGENT` is set in FastAPI
- [ ] `DCF_ENGINE_EXPOSE_DOCS` is unset
- [ ] `DCF_ENGINE_URL` points to the intended FastAPI service
- [ ] `CONVEX_URL` is set where server-side Convex access is expected
- [ ] `DAMODARAN_SYNC_TOKEN` is set where Convex writes are expected
- [ ] Browser traffic reaches FastAPI only through Next.js routes
- [ ] Direct unsigned FastAPI requests return `401`
- [ ] FastAPI docs endpoints are unavailable

## Failure Modes and Triage

### Symptom: Next.js API routes fail, direct FastAPI health/network looks fine

Likely causes:

- `DCF_ENGINE_INTERNAL_KEY` missing in Next.js
- `DCF_ENGINE_INTERNAL_KEY` mismatch between Next.js and FastAPI
- `DCF_ENGINE_URL` points to the wrong FastAPI instance
- FastAPI is missing `CONVEX_URL` or `DAMODARAN_SYNC_TOKEN`

Check:

- Next.js runtime env values
- FastAPI runtime env values
- deployment target URLs

### Symptom: Direct unsigned FastAPI requests still succeed

Likely causes:

- `DCF_ENGINE_INTERNAL_KEY` is unset in FastAPI
- `DCF_ENGINE_ALLOW_UNSIGNED=1` is still enabled
- old FastAPI release still running

Check:

- FastAPI runtime env
- deployment revision/rollout status

### Symptom: FastAPI SEC-backed routes return server errors

Likely causes:

- `SEC_USER_AGENT` missing
- upstream SEC/network issue

Check:

- FastAPI env
- app logs for `SEC_USER_AGENT environment variable is required`

### Symptom: Valuation history reads fail in frontend/client code

Expected if the caller relied on anonymous Convex access.

Current posture:

- valuation history is private by default
- Convex valuation read queries require `syncToken`
- the unused anonymous `useValuationHistory` hook was removed
- FastAPI replay protection and `/dcf/compute` rate limiting are deployment-wide only when signed mode has Convex connectivity

## Rollback

### Fast rollback

If production traffic is broken because FastAPI auth enforcement is rejecting signed requests unexpectedly:

1. Unset `DCF_ENGINE_INTERNAL_KEY` in FastAPI.
2. Redeploy FastAPI.

This returns FastAPI to non-enforcing mode while preserving the rest of the release.

Do not use this as a normal operating mode in public or shared environments.

### Full rollback

1. Roll back the Next.js deployment.
2. Roll back the FastAPI deployment.
3. Reconfirm direct FastAPI behavior and Next.js smoke tests.

## Steady-State Operations

- Keep `DCF_ENGINE_INTERNAL_KEY` rotated and managed like an internal service secret.
- Keep `INTERNAL_PERSISTENCE_KEY` separate from FastAPI auth.
- Keep `DCF_ENGINE_EXPOSE_DOCS` off outside local/dev.
- Keep `CONVEX_URL` and `DAMODARAN_SYNC_TOKEN` configured in FastAPI anywhere signed mode is enabled.
- Re-run the deployment smoke tests after any env or infrastructure change touching FastAPI routing.

## Verification Commands

Local verification for this repo:

```bash
bun test
bun test convex_tests
cd python && pytest && cd ..
bunx convex typecheck
```
