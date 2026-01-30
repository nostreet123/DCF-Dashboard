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
| `snapshots.ts` | Snapshot CRUD: upsert, finalize, getByIdentity |
| `tableData.ts` | Row storage: insertBatch, delete, pagination |
| `syncLogs.ts` | Sync operation logs: create, increment, finish |
| `syncErrors.ts` | Error tracking per sync operation |
| `syncManifests.ts` | Manifest hash tracking for fast-exit |
| `syncAuth.ts` | Token validation: `requireSyncToken()` |
| `assets.ts` | Discovered asset records |
| `reference.ts` | Reference data queries (datasets, regions) |
| `seed.ts` | Initial data seeding |
| `metrics.ts` | Usage metrics tracking |
| `valuations.ts` | DCF valuation run storage |
| `_generated/` | Auto-generated types (do not edit) |

## Core Patterns

### 1. Enum Types with v.union()

See `schema.ts:4-46`:
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

See `schema.ts:48-162`:
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
- Token validated against `DAMODARAN_SYNC_TOKEN` env var
- Throws on mismatch or missing token

### 4. Build ID Read Semantics

See `tableData.ts:105-135`:
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
