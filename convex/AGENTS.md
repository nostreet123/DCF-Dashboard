# AGENTS.md - Convex Database Layer

## Module Overview

Convex provides the serverless database layer with real-time sync capabilities.

**Architecture**: Schema-first design with typed mutations and queries.

```
schema.ts (defines tables/indexes)
    ↓
snapshots.ts, tableData.ts, syncLogs.ts, ... (mutations/queries)
    ↓
syncAuth.ts (authentication middleware)
```

## File Inventory

| File | Purpose |
|------|---------|
| `schema.ts` | Table definitions, indexes, enum types |
| `seed.ts` | Initial reference data seeding |
| `reference.ts` | Reference snapshot/row queries: `getLatestSnapshot`, `getSnapshotAtOrBefore`, `getRow` |
| `catalog.ts` | Composed catalog sidebar query: `getSidebar` (categories + datasets) |
| `industries.ts` | Industry metric lookups from active snapshots |
| `snapshots.ts` | Snapshot CRUD: upsert, finalize, getByIdentity |
| `snapshots_helpers.ts` | Shared snapshot helpers: identity lookup, limits, best-snapshot pick |
| `tableData.ts` | Row storage: insertBatch, delete, pagination |
| `normalization.ts` | Shared symbol/limit normalization helpers |
| `companies.ts` | Company fundamentals cache: `get`, `search`, `upsertCompany`, backfill |
| `companyStatements.ts` | Period-level statement storage: `listBySymbol`, `upsertBatch` |
| `imports.ts` | Import artifacts + imported facts: parse/approve mutations and queries |
| `valuations.ts` | DCF valuation run + trace storage: `create`, `get`, `listBySymbol`, `listByTicker` |
| `requestIdDedupe.ts` | Request-id dedupe helper for idempotent writes |
| `syncLogs.ts` | Sync operation logs: create, increment, finish |
| `syncErrors.ts` | Error tracking per sync operation |
| `syncManifests.ts` | Manifest hash tracking for fast-exit |
| `assets.ts` | Discovered asset records: `record`, `recordBatch` |
| `metrics.ts` | Usage metrics: `getCounts` |
| `syncAuth.ts` | Sync token validation: `requireSyncToken()` |
| `securityAuth.ts` | Signed-request nonce/replay-protection state |
| `securityRateLimit.ts` | Security rate-bucket counters: `hitBucket` |
| `rateLimits.ts` | Shared API rate-limit counters |
| `maintenance.ts` | Re-exports maintenance entry points |
| `maintenance/` | Duplicate scan/cleanup, pruning, and backfill logic |
| `http.ts` | Convex HTTP router (`/health`) |
| `_generated/` | Auto-generated types (do not edit) |

## Core Patterns

### 1. Enum Types with v.union()

See `schema.ts:4-84`:
```bash
rg "const.*= v.union" schema.ts
```

Pattern - ALWAYS use `v.union(v.literal(...))`:
```typescript
const DataType = v.union(
  v.literal("industry"),
  v.literal("country"),
  v.literal("timeseries"),
  v.literal("other"),
);
```

❌ Never use: `v.string()` for enums, TypeScript enums

### 2. Index Design for Queries

See `schema.ts:95-562`:
```bash
rg "\.index\(" schema.ts
```

Pattern:
```typescript
snapshots: defineTable({...})
  .index("by_identity", ["datasetKey", "regionCode", "asOfDate"])
  .index("by_dataset_region", ["datasetKey", "regionCode"])
```

- Every table scan MUST use `.withIndex()`
- Index name pattern: `by_<field>` or `by_<field1>_<field2>`
- Compound indexes for multi-field lookups

### 3. Mutation Authentication

See `syncAuth.ts`:
```bash
rg "requireSyncToken" convex/
```

Pattern:
```typescript
export const myMutation = mutation({
  args: {
    syncToken: v.optional(v.string()),
    // ... other args
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    // ... mutation logic
  },
});
```

- All write operations require `syncToken`
- Token checks are synchronous and timing-resistant (`TextEncoder` + XOR compare)
- `requireSyncToken()` throws `UNAUTHORIZED` on missing/mismatch config or token
- For public queries with optional elevated access, use `hasValidSyncToken()` and redact by default

### 4. Build ID Read Semantics

See `tableData.ts:368` (`listBySnapshot`):
```bash
rg "listBySnapshot" tableData.ts -A 30
```

Pattern:
```typescript
// Always read using activeBuildId from snapshot
const snapshot = await ctx.db.get(args.snapshotId);
const rows = await ctx.db.query("tableData")
  .withIndex("by_snapshot_build_rowIndex", (q) =>
    q.eq("snapshotId", args.snapshotId)
     .eq("buildId", snapshot.activeBuildId)
  );
```

- Readers filter by `activeBuildId` (not `pendingBuildId`)
- Ensures consistent reads during rebuilds
- Old buildId rows are orphaned until cleanup

## Mutation Contracts

### snapshots:upsertByIdentity

Creates or updates a snapshot. Returns `{ snapshotId, action, previousBuildId? }`.

Actions:
- `"created"` - New snapshot inserted
- `"updated"` - Existing snapshot updated, rebuild started
- `"unchanged"` - Hash matches, no action needed

### snapshots:finalizeRebuild

Promotes `pendingBuildId` → `activeBuildId`, sets status `"ready"`.

### tableData:insertBatch

Inserts rows tagged with `buildId`. Max 100 rows per call (configurable).

### tableData:deleteBySnapshotBuild

Deletes rows by `snapshotId` + `buildId`. Used for cleanup after finalize.

## Key Examples

```bash
# Find all mutations
rg "export const.*= mutation" convex/

# Find all queries
rg "export const.*= query" convex/

# Find index usage
rg "withIndex\(" convex/

# Find table definitions
rg "defineTable\(" schema.ts

# Find error handling
rg "throw new Error" convex/
```

## JIT Index Commands

```bash
# Find v.union enum definitions
rg "v\.union\(" schema.ts

# Find all table indexes
rg "\.index\(" schema.ts

# Find pagination usage
rg "paginate\(" convex/

# Find syncToken checks
rg "requireSyncToken" convex/

# Find batch size limits
rg "max.*rows|MAX.*ROWS|Batch too large" convex/
```

## Deployment

```bash
# Development (local)
bunx convex dev

# Type check
bunx convex typecheck

# Production deploy
bunx convex deploy

# Run function locally
bunx convex run seed:upsertAll
```

## Environment Variables (Convex Dashboard)

| Variable | Purpose |
|----------|---------|
| `DAMODARAN_SYNC_TOKEN` | Required for all mutations |
| `TABLEDATA_INSERT_MAX_ROWS` | Max rows per insertBatch (default 100) |

## Pre-PR Checks

```bash
# Type check all Convex code
bunx convex typecheck

# Verify schema is valid
bunx convex dev --once
```

Checklist:
- [ ] `bunx convex typecheck` passes
- [ ] All mutations call `requireSyncToken()`
- [ ] All queries use `.withIndex()` (no full scans)
- [ ] Enums use `v.union(v.literal(...))` pattern
- [ ] New tables have appropriate indexes
- [ ] No `console.log` in production code
