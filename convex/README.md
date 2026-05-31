# Convex Backend

This directory holds the optional Convex persistence layer for DCF Dashboard. Convex is **not required** for the UI demo or direct compute flow — it adds saved valuation runs, replay history, imported company facts, and the Damodaran sync data store.

See the repository [`docs/convex-persistence.md`](../docs/convex-persistence.md) for the end-to-end request flow, environment variables, and local setup.

## Layout

- `schema.ts` — all tables, indexes, and `v.union(v.literal(...))` enums (the source of truth for the data model).
- Query/mutation modules grouped by domain: snapshots and `tableData` (Damodaran datasets), `companies`/`companyStatements` (fundamentals cache), `imports` (reviewed imports), `valuations` (DCF runs), sync logs/errors/manifests, and `maintenance/` (duplicate scan/cleanup, pruning, backfill).
- `syncAuth.ts` / `securityAuth.ts` — token validation and signed-request replay protection.
- `_generated/` — auto-generated types; do not edit.

A full file-by-file inventory and the core patterns (auth, indexing, build-id read semantics) live in [`AGENTS.md`](AGENTS.md). The cross-layer data model is documented in [`../DATA_MODEL.md`](../DATA_MODEL.md).

## Common Commands

```bash
bunx convex dev         # local dev server, watches convex/
bunx convex typecheck   # type-check Convex functions
bunx convex dev --once  # validate the schema without watching
bunx convex deploy      # deploy schema + functions (CI / production)
```

## Conventions

- Write mutations require a sync token (`requireSyncToken()`). Many read queries are intentionally unauthenticated (e.g. `catalog.getSidebar`, `companies.get`, `companies.search`); see each module for its auth expectations.
- Every query reads through an index (`.withIndex(...)`) — no full table scans.
- Enums are always `v.union(v.literal(...))`, never `v.string()` or TypeScript enums.

## Environment Variables (Convex Dashboard)

| Variable | Purpose |
|----------|---------|
| `DAMODARAN_SYNC_TOKEN` | Shared secret required for all mutations and signed-request replay protection |
| `TABLEDATA_INSERT_MAX_ROWS` | Max rows per `insertBatch` (default 100) |
| `ASSETS_RECORD_MAX_ROWS` | Max rows per `assets.recordBatch` (default 500, max 1000) |
