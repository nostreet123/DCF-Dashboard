# AGENTS.md - DCF Dashboard

## Project Snapshot

- **Type**: Simple hybrid project (Python 3.12+ backend, Convex TypeScript database)
- **Package managers**: Bun (JavaScript), pip (Python)
- **Database**: Convex serverless
- **Testing**: pytest (Python only)
- Sub-modules have their own AGENTS.md files for detailed guidance.

## Assistant Collaboration Log

- **Log file**: `ASSISTANT_LOG.md` at repo root
- **Purpose**: Track assistant mistakes and user preferences
- **Update cadence**: After each meaningful task
- **Mistakes format**: Date, task/context, mistake, correction, next-time guardrail
- **Preferences format**: Date, preference, how it will be applied
- **Retention**: Append entries; do not remove history unless explicitly asked

## Quick Setup

```bash
# Install dependencies
bun install                           # Convex TypeScript
pip install -e ./python[dev]          # Python packages

# Development
 bunx convex dev                       # Local Convex
 cd python && python -m damodaran_sync.cli sync-current  # Run sync

# Build & Test
bunx convex deploy                    # Deploy Convex
cd python && pytest                   # Run all tests
```

## Component Map

| Directory | Purpose | Details |
|-----------|---------|---------|
| `python/damodaran_sync/` | Sync engine: Discovery → Download → Parse → Transform → Upload | [AGENTS.md](python/damodaran_sync/AGENTS.md) |
| `python/dcf_engine/` | DCF valuation: Normalize → Schedule → Forecast → Discount → Bridge | [AGENTS.md](python/dcf_engine/AGENTS.md) |
| `convex/` | Convex database: Schema, mutations, queries | [AGENTS.md](convex/AGENTS.md) |
| `python/tests/` | pytest test suite with golden tests | [AGENTS.md](python/tests/AGENTS.md) |

## Universal Conventions

### Python

- **Always**: `from __future__ import annotations` at top of every file
- **Naming**: `snake_case` for functions/variables, `PascalCase` for classes
- **Types**: Use type hints everywhere (`def func(x: int) -> str:`)
- **Logging**: Use `logging.getLogger(__name__)`, never bare `print()` in library code
- **Pydantic**: Use `BaseModel` for all data structures with validation

### TypeScript (Convex)

- **Naming**: `camelCase` for functions/variables
- **Enums**: Use `v.union(v.literal("a"), v.literal("b"))` - never string enums
- **Mutations**: All mutations require `syncToken` via `requireSyncToken()`
- **Queries**: Use `withIndex()` for all list queries - never full table scans

### Git

- **Branches**: Feature branches off `main`
- **Commits**: Conventional commits (`feat:`, `fix:`, `refactor:`)
- **PRs**: Link to relevant issue, include test coverage

## Core Architecture Pattern: Build ID

The codebase uses a **Build ID** pattern for atomic data replacement:

1. **Upsert**: Create snapshot with `pendingBuildId`, status `"rebuilding"`
2. **Insert**: Insert tableData rows with `buildId` tag
3. **Finalize**: Promote `pendingBuildId` → `activeBuildId`, status → `"ready"`
4. **Cleanup**: Delete rows with old `buildId`

This ensures readers never see partial data during rebuilds.

## JIT Index - Quick Find Commands

```bash
# Find Python entry points
rg "def main|def cli|@click" python/

# Find Convex mutations
rg "export const.*= mutation" convex/

# Find Convex queries
rg "export const.*= query" convex/

# Find Pydantic models
rg "class.*BaseModel" python/dcf_engine/

# Find tests for a module
rg "def test_" python/tests/test_<module>.py
```

## Security & Secrets

- **Never commit**: `.env`, tokens, credentials
- **Environment variables**:
  - `CONVEX_URL` - Convex deployment URL
  - `DAMODARAN_SYNC_TOKEN` - Authentication for mutations
- **Secrets location**: `.env` (gitignored), Convex dashboard for production
- **Token validation**: All mutations use `requireSyncToken()` from `convex/syncAuth.ts`

## Pre-PR Definition of Done

```bash
# Run from repo root
cd python && pytest && cd ..      # All tests pass
bunx convex typecheck             # Convex types valid
```

- All tests pass locally
- No `print()` statements in library code
- Type hints on all new functions
- Commit message follows conventional format
