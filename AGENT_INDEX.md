# Agent Index

Use this as the first stop for agent work. It is intentionally shorter than the
architecture docs; open only the section that matches the task.

## Context Budget Rules

- Start with `AGENTS.md`, this file, and the nearest nested `AGENTS.md`.
- Do not inspect `.agents/skills/**` unless the user names a skill or the task
  is skill maintenance.
- Do not inspect generated, vendored, cache, or workspace-output paths by
  default: `.worktrees/**`, `.next/**`, `.bun-home/**`, `node_modules/**`,
  `__pycache__/**`, `.pytest_cache/**`, `convex/_generated/**`, and coverage or
  Playwright output directories.
- Prefer `rg` and targeted file reads over broad tree dumps.
- Use `documentation/CODEBASE_MAP.md` for deeper orientation only after the
  quick map below is not enough.

## Task Routes

| Task | Inspect first | Focused validation |
| --- | --- | --- |
| Frontend dashboard behavior | `app/page.tsx`, `app/DashboardClient.tsx`, `components/workspace/`, `components/layout/`, `lib/hooks/useDashboardController.ts` | `npm run test:ui:focused`, then `npm run lint` |
| DCF preview/run API | `app/api/dcf/preview/route.ts`, `app/api/dcf/run/route.ts`, `app/api/_lib/dcfEngine.ts`, `python/dcf_engine/service/app.py` | `npm run test:api:focused`, then `pytest python/tests/test_service_app_sec_routes.py` |
| Python DCF engine | `python/dcf_engine/engine.py`, `forecast.py`, `discounting.py`, `bridge.py`, `schema.py` | `npm run test:py:engine` |
| Damodaran sync | `python/damodaran_sync/sync.py`, `download.py`, `excel_parse.py`, `transform.py`, `convex_client.py` | `npm run test:py:sync` |
| Convex database behavior | `convex/schema.ts`, `convex/snapshots.ts`, `convex/tableData.ts`, `convex/maintenance/` | `npm run test:convex:focused`, then `npm run convex:typecheck` |
| Security/auth change | `app/api/_lib/`, `app/api/dcf/run/route.ts`, `python/dcf_engine/service/internal_auth.py`, `python/dcf_engine/service/app.py`, `convex/syncAuth.ts` | `npm run test:security:focused` |
| Browser-visible UI change | Relevant UI route above plus `e2e/` | `npm run harness:e2e:smoke` |
| Broad PR readiness | Changed files plus nearest test files | `npm run harness:verify` |

## Core Invariants

- Convex writes require `syncToken` and `requireSyncToken()`.
- Convex list queries use indexes via `.withIndex()` or an explicit search
  index.
- Snapshot readers use `activeBuildId`; rebuilds write under `pendingBuildId`
  until finalize.
- Python library code uses logging, not `print()`.
- API routes and FastAPI service defaults are fail-closed unless local dev flags
  explicitly allow unsigned access.
- npm is the canonical JavaScript package manager. Bun is only the test runner.

## Useful Maps

- `documentation/CODEBASE_MAP.md`: deeper code-backed architecture map.
- `DATA_MODEL.md`: schema and data relationship detail.
- `.agent/PLANS.md`: ExecPlan conventions.
- `docs/agent-context-policy.md`: full context inclusion and exclusion policy.
- `ASSISTANT_LOG.md`: current collaboration notes.
- `docs/assistant-log-archive.md`: full historical collaboration log.
