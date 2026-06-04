# Convex Persistence Flow

Convex is **optional**. The UI demo and the direct compute demo both work without it. When configured, Convex adds saved-run history and replay.

## What Convex Stores

| Table | Purpose |
|---|---|
| `valuationRuns` | One record per completed DCF run — inputs, result summary, and an optional full trace |
| `valuationRunTraces` | Full engine traces stored separately when trace storage is external |
| `importedFacts` | Company facts imported from CSV/XLSX/PDF or synced from Damodaran — survives browser refreshes |
| `companies` / `companyStatements` | Catalog entries and period-level financial statements |
| `tableData` | Damodaran snapshot dataset rows, tagged by snapshot id + build id |
| `importArtifacts` | Parsed import payloads (CSV/XLSX/PDF) held for review until approved |
| `securityNonces` | Short-lived tokens used for FastAPI signed-request replay protection |

## Environment Variables

| Variable | Where used | Required for |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Next.js browser bundle | Live Convex reads from the browser (search, history panel) |
| `CONVEX_URL` | Next.js server and FastAPI | Server-side Convex queries and mutations; FastAPI nonce replay protection |
| `CONVEX_DEPLOY_KEY` | CI / `convex deploy` | Deploying schema and functions to the Convex project |
| `CONVEX_DEPLOYMENT` | Local dev (`bunx convex dev`) | Identifies the local dev deployment |
| `DAMODARAN_SYNC_TOKEN` | FastAPI + Convex env | Shared secret that signs inter-service requests; must match on both sides |

`CONVEX_URL`, `CONVEX_DEPLOY_KEY`, and `DAMODARAN_SYNC_TOKEN` are **private** — keep them out of public env files and CI logs. `NEXT_PUBLIC_CONVEX_URL` is intentionally public; it only gives read access to tables your Convex functions expose.

## Request Flow — Saving a Run

```
Browser
  → POST /api/dcf/run  (Next.js route, signed with INTERNAL_PERSISTENCE_KEY)
    → fetchDcfEngine("/dcf/compute")  (FastAPI, signed with DCF_ENGINE_INTERNAL_KEY)
      ← DCF result
    → Convex mutation valuations:create  (server-side, uses CONVEX_URL)
      ← Convex document ID
  ← JSON response with result + runId
```

Persistence only happens when the Next.js route receives valid internal auth headers (`x-dcf-internal-signature`, `x-dcf-internal-ts`, `x-dcf-internal-nonce` — HMAC + timestamp + nonce). Unsigned requests (e.g. demo mode, `DCF_ENGINE_ALLOW_UNSIGNED=1`) compute normally but do not write to Convex.

## Request Flow — Replay History

Browser-readable saved history and import context are **local/test only** today. Hosted public preview runs with these flags unset; production also hard-stops the browser routes even if the flags are mis-set unless `DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES=1` (local repro only — never on public preview).

When enabled for local development:

```
Browser (NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS=1, server: VALUATION_HISTORY_BROWSER_READS=1)
  → GET /api/dcf/history/browser?symbol=AAPL
    → Convex query valuations:listByTicker  (server-side)
    ← sanitized run list (no trace data, only result summaries)
  ← { runs: [...] }

Browser selects a run
  → GET /api/dcf/history/browser/{runId}
    → Convex query valuations:get
    ← full replay snapshot (inputs, projections, sensitivity, Monte Carlo)
  ← { replay: {...} }
```

The browser-facing history route (`/api/dcf/history/browser`) requires **both** `NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS=1` (Next.js browser bundle gate) and `VALUATION_HISTORY_BROWSER_READS=1` (server-side route gate, non-production or explicit debug escape hatch). It strips traces and inputs before returning data to the browser. The internal route (`/api/dcf/history`) requires the `x-dcf-internal-signature` / `x-dcf-internal-ts` / `x-dcf-internal-nonce` signed headers and returns the full record.

Saved-run browser reads with tenant-scoped auth are planned for the later private-beta SaaS work, not public preview.

## Local Setup

```bash
# Install Convex CLI (already in devDependencies)
bunx convex dev   # starts the local Convex dev server and watches convex/

# Add to .env.local
NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
CONVEX_URL=https://<your-deployment>.convex.cloud
CONVEX_DEPLOYMENT=dev:<your-deployment>
DAMODARAN_SYNC_TOKEN=<any-random-secret>
```

Set the same `DAMODARAN_SYNC_TOKEN` value in your Convex dashboard under **Settings → Environment Variables** so FastAPI and Convex share the same secret.

## Disabling Convex Completely

Leave all `CONVEX_*` variables unset. The app falls back to demo mode or direct-compute mode with no history panel. The `/api/settings/status` route reports `convex: false` so you can verify the configuration at runtime.
