# Provider And Data-Flow Notes

This document describes what leaves the deployment boundary, what credentials are involved, how to disable each integration, and typical failure modes. It complements [convex-persistence.md](./convex-persistence.md) and [DEPLOY_SECURITY_RUNBOOK.md](../DEPLOY_SECURITY_RUNBOOK.md).

> **Disclaimer:** DCF Dashboard is a modeling tool. Data from third parties may be delayed or incomplete. Do not treat outputs as investment advice.

## Summary Table

| Provider | Used for | Credentials | Stored locally | Disable |
|----------|----------|-------------|----------------|---------|
| SEC EDGAR | Company search and facts | `SEC_USER_AGENT` (required for live SEC) | Cached in Convex when persistence enabled | Use mock demo mode; omit engine SEC routes |
| Damodaran sources | Reference datasets via sync | `DAMODARAN_SYNC_TOKEN`, mirror URLs | Convex `tableData` / snapshots | Do not run sync; skip Convex |
| Convex | Runs, imports, rate-limit/nonce state | `CONVEX_URL`, `CONVEX_DEPLOY_KEY`, `DAMODARAN_SYNC_TOKEN` | Cloud project data | Omit `CONVEX_URL` / public URL |
| Hugging Face | AI scenario analysis | `HUGGING_FACE_API_KEY` | Prompt/response not committed | Omit API key; route returns unavailable |
| Next.js ↔ FastAPI | Valuation compute | `DCF_ENGINE_INTERNAL_KEY` | N/A (in-memory per request) | Mock demo or unsigned local-only flags |

## SEC EDGAR

**Flow:** FastAPI (`/sec/search`, `/sec/facts`) or Next.js proxies → `python/dcf_engine/service/sec_edgar.py` → `https://www.sec.gov` (and related EDGAR endpoints).

**Credentials:** `SEC_USER_AGENT` must identify your organization/contact per SEC fair-access policy. Not a secret, but operationally sensitive — do not share a personal email in public screenshots.

**Retention:** Responses may be cached in Convex `companies` / `companyStatements` when persistence and sync paths are enabled.

**Logging:** Server logs should not include full filing payloads at info level in production.

**Disable:** Run `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo` for UI-only mock data, or do not configure a reachable engine with `SEC_USER_AGENT`.

**Failure modes:** Missing `SEC_USER_AGENT` → engine error; SEC rate limits → upstream errors surfaced as sanitized API failures; direct engine exposure bypasses Next.js rate limits — keep engine private.

## Damodaran Reference Data

**Flow:** `python/damodaran_sync/` downloads manifests/Excel (configurable hosts) → Convex mutations (`snapshots`, `tableData`) when sync jobs run.

**Credentials:** `DAMODARAN_SYNC_TOKEN` must match between Convex and Python sync callers.

**Retention:** Snapshot rows in Convex until maintenance/prune jobs run.

**Disable:** Do not schedule sync (`Damodaran Weekly Sync` workflow is maintainer-only); omit Convex for local demos.

**Failure modes:** Host allowlist blocks (`DAMODARAN_ALLOWED_ASSET_HOSTS`); download size caps; manifest unchanged fast-exit — see `.env.example` tuning vars.

## Convex

**Flow:** Next.js server and FastAPI use `CONVEX_URL` for queries/mutations; browser may use `NEXT_PUBLIC_CONVEX_URL` for optional live reads (history, catalog).

**Credentials:**

- `CONVEX_DEPLOY_KEY` — deploy/schema only (CI or maintainer)
- `DAMODARAN_SYNC_TOKEN` — mutating functions and signed server paths
- No secrets in `NEXT_PUBLIC_CONVEX_URL`

**Retention:** Valuation runs, imports, sync logs per [convex-persistence.md](./convex-persistence.md).

**Disable:** Omit Convex env vars; use mock demo and `npm run demo:compute`.

**Failure modes:** Missing token on writes → `UNAUTHORIZED`; missing Convex in signed FastAPI mode → `503` shared nonce store errors; misconfigured public history flags → unintended browser reads (keep `VALUATION_HISTORY_BROWSER_READS` unset unless intentional).

## Hugging Face (AI Scenario Analysis)

**Flow:** `POST /api/ai/scenario-analysis` → `lib/ai/scenarioAnalysis/*` → Hugging Face inference API.

**Credentials:** `HUGGING_FACE_API_KEY` (server-only). Optional demo admin bypass via `DCF_DEMO_ADMIN_TOKEN_SHA256`.

**Retention:** No provider responses committed to git; transient request handling in server memory/logs.

**Disable:** Unset `HUGGING_FACE_API_KEY` — settings status reports AI unavailable.

**Failure modes:** Token missing, model timeout (`HUGGING_FACE_PROVIDER_TIMEOUT_MS`), payload caps (`HUGGING_FACE_MAX_INPUT_BYTES`) — routes fail closed with sanitized errors.

## Internal Service Auth (Not A Third Party)

**Flow:** Next.js signs FastAPI with `DCF_ENGINE_INTERNAL_KEY`; privileged Next.js routes use `INTERNAL_PERSISTENCE_KEY`.

**Disable in production:** Never use `DCF_ENGINE_ALLOW_UNSIGNED`, `DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES`, or `DCF_ENGINE_EXPOSE_DOCS` on hosted URLs.

See [public-repo-audit-phase1.md](./public-repo-audit-phase1.md) for the local-only flag list.

## Redaction Checklist (Media And Samples)

Before committing screenshots, sample JSON, or verification logs:

- [ ] No `.env.local`, API keys, or Convex deployment URLs in images
- [ ] No real maintainer email in `SEC_USER_AGENT` examples in pixels
- [ ] Demo tickers only (mock mode uses fictional/sample fundamentals)
- [ ] Financial numbers framed as illustrative model output
