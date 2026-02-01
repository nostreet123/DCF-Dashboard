# Execution Plan: ARCHITECTURE.md

## Purpose

Implement the prototype architecture described in `documentation/ARCHITECTURE.md` in a sequence that preserves data integrity, follows security rules, and enables incremental review.

## Current Gap Inventory (Doc → Repo)

### Convex

- Schema:
  - Missing `companies` and `companyStatements` tables and indexes.
  - Missing `tableData` search index `search_primaryKey` with `snapshotId` and `buildId` filters.
  - Missing `valuationRuns.by_symbol_createdAt` index and `symbol` optional field.
- Functions:
  - Missing `catalog:getSidebar`.
  - Missing `companies:get`, `companies:search`, `companies:upsertCompany`.
  - Missing `companyStatements:listBySymbol`, `companyStatements:upsertBatch`.
  - Missing `industries:search` using `searchIndex` + active snapshot.
  - Missing `valuations:listByTicker`.
  - Missing HTTP action `/health`.

### Python

- Missing EDGAR integration at `python/dcf_engine/service/sec_edgar.py`.
- Missing workbench runner at `python/dcf_engine/workbench/`.
- Missing FastAPI app at `python/dcf_engine/service/app.py`.

### Next.js

- Missing Next.js scaffold and API routes for:
  - `GET /api/company/search`
  - `GET /api/company/facts`
  - `POST /api/dcf/preview`
  - `POST /api/dcf/run`

## Implementation Order (per ARCHITECTURE.md)

1) Convex schema + functions (catalog, companies, statements, industries, valuations ticker)
2) Python FastAPI + EDGAR + workbench + KPI layer
3) Next.js scaffold + ConvexProvider + API routes
4) UI pixel-close + SVG charts + dark/light (out of scope until UI work begins)
5) Wiring preview/run + realtime history + audit trail
6) Tests + typecheck + manual acceptance

## Commit Strategy

- One commit per major todo item to simplify review.
- Avoid staging unrelated files (e.g., existing untracked docs/images) unless requested.
- Commit messages use conventional commits and explain the intent.

## Acceptance Checklist

- Convex typecheck passes (`bunx convex typecheck`).
- Python tests pass (`cd python && pytest`).
- Manual flows validated:
  - US ticker: search → facts → preview → run → history.
  - Non-US manual import: preview/run marked manual.
  - Run replay reproduces KPI/tables for audit.

## Verification Log

- `bunx convex typecheck`: passed.
- `python3 -m venv .venv` then `.venv/bin/pytest`: passed (73 tests).
- Manual acceptance (partial):
  - FastAPI `/sec/search` + `/sec/facts` for AAPL succeeded (placeholder `SEC_USER_AGENT`).
  - Next.js `/api/dcf/preview` succeeded (scenario fields in snake_case).
  - Next.js `/api/company/search` succeeded via EDGAR fallback after `convex dev --once --typecheck=disable`.
  - Blocked: `/api/company/facts` and `/api/dcf/run` (missing `DAMODARAN_SYNC_TOKEN` in Convex env), history/replay not validated.
