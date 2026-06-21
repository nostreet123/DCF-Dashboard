# Hosted Public Preview

This guide describes a public demonstration deployment of DCF Dashboard. It does not make the project a production SaaS: end-user authentication, tenant isolation, billing, organization management, and production support remain out of scope.

## Choose The Smallest Mode

| Mode | Public browser | Server requirements | Recommended use |
|---|---|---|---|
| Mock demo | Next.js UI with `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo` | No Python, Convex, SEC, or AI secrets | Lowest-risk public showcase |
| Live EDGAR | Next.js plus private FastAPI service | Signed engine traffic, `SEC_USER_AGENT`, `CONVEX_URL`, `DAMODARAN_SYNC_TOKEN`, and shared replay state | Public preview with live company facts |
| Convex persistence | Live mode plus Convex | Server-side Convex credentials and private persistence routes | Maintainer-controlled previews only |
| AI scenario analysis | UI plus server-side provider route | `HUGGING_FACE_API_KEY`, `HUGGING_FACE_MODEL`, `CONVEX_URL`, `DAMODARAN_SYNC_TOKEN`, and public-demo rate limits | Optional capped demonstration |

Start with mock mode. Add one optional service at a time and rerun the smoke checks after each change.

## Configuration Boundary

Use [`.env.example`](../.env.example) as the configuration inventory. The categories below determine where those values may be exposed.

### Browser-Public Values

- `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo`
- `NEXT_PUBLIC_CONVEX_URL` only when direct browser reads are intentionally required

Every `NEXT_PUBLIC_*` value is bundled for the browser and must be safe to disclose.

### Server-Only Secrets

- `DCF_ENGINE_INTERNAL_KEY`
- `INTERNAL_PERSISTENCE_KEY`
- `DAMODARAN_SYNC_TOKEN`
- `CONVEX_DEPLOY_KEY`
- `HUGGING_FACE_API_KEY`
- raw admin or browser tokens

Store these in the hosting platform's secret manager. Never put them in client variables, committed environment files, screenshots, logs, or PR descriptions.

### Operationally Private Values

- `DCF_ENGINE_URL`
- `CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `SEC_USER_AGENT`
- `DCF_TRUSTED_PROXY_MODE`
- `DCF_TRUSTED_PROXY_CIDRS`

Keep these server-side even when they are not authentication secrets.

## Flags That Must Stay Off Publicly

Leave all of these unset:

- `DCF_ENGINE_ALLOW_UNSIGNED`
- `DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES`
- `DCF_ENGINE_EXPOSE_DOCS`
- `DCF_RATE_LIMIT_ALLOW_LOCALHOST`
- `VALUATION_HISTORY_BROWSER_READS`
- `NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS`
- `IMPORT_CONTEXT_BROWSER_TOKEN_SHA256`
- `IMPORT_APPROVAL_BROWSER_WRITES`
- `IMPORT_APPROVAL_BROWSER_TOKEN_SHA256`
- `DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES`

These are local/test escape hatches or browser-debug surfaces. A hosted preview must fail closed rather than enable them for convenience.

## Deployment Sequence

1. Deploy the no-secret mock UI and verify the dashboard.
2. If live EDGAR is needed, deploy FastAPI privately with signed mode and shared Convex replay protection, then point Next.js to it.
3. Add Convex persistence only after private routes and server credentials are verified.
4. Add AI analysis last, with server-only credentials and explicit public-demo rate limits.

Use [DEPLOY_SECURITY_RUNBOOK.md](../DEPLOY_SECURITY_RUNBOOK.md) for key matching, rollout order, rollback, and failure triage.

## Public Preview Smoke Checks

### Always

- The dashboard loads over HTTPS.
- Browser developer tools contain no secret values.
- `npm run harness:verify` passed on the deployed Git ref before release.
- Browser debug, valuation-history, import-context, and import-approval routes remain unavailable.

### Mock Mode

- The dashboard renders mock companies and valuation cards.
- No requests require FastAPI, Convex, SEC, or Hugging Face.

### Live EDGAR Mode

- Next.js company search, facts, and preview routes succeed.
- `POST /api/dcf/run` stays unavailable unless Convex persistence and internal signing are intentionally enabled.
- Direct unsigned FastAPI compute and SEC routes return `401`.
- FastAPI `/docs`, `/redoc`, and `/openapi.json` return `404`.
- Signed mode without shared replay state fails closed with `503`.

### Optional Integrations

- Convex writes occur only through intended server-side paths.
- AI requests are rate-limited and provider errors do not expose credentials or internal payloads.

## Release Decision

Publish only when every enabled mode passes its checks and every disabled integration is visibly optional. A passing public preview does not establish production SaaS readiness.
