# Agent Context Policy

This repo has enough docs, generated output, local worktrees, and skill assets
that agents can waste context before touching the real task. Use this policy to
keep context small and relevant.

## Include By Default

- Root instructions: `AGENTS.md`, `AGENT_INDEX.md`.
- The nearest nested `AGENTS.md` for the files being changed.
- The concrete source files named by the task.
- Adjacent tests for changed behavior.
- `package.json` only when commands, dependencies, or scripts matter.

## Include On Demand

- `documentation/CODEBASE_MAP.md` for architecture orientation.
- `DATA_MODEL.md` for schema and relationship detail.
- `.agent/**` only for ExecPlan or planning work.
- `docs/**` only when the user asks for documentation, release, audit, or public
  repo work.
- `.codex/skills/**` when maintaining repo-local helper skills.
- `.agents/skills/**` only when the user names a skill or asks for skill/plugin
  maintenance.

## Exclude By Default

- Dependency directories: `node_modules/**`, `.bun-home/**`, `.venv/**`.
- Build and cache output: `.next/**`, `out/**`, `dist/**`, `build/**`,
  `__pycache__/**`, `.pytest_cache/**`, `.mypy_cache/**`, `*.tsbuildinfo`.
- Local workspaces: `.worktrees/**`.
- Generated Convex files: `convex/_generated/**`.
- Browser and coverage output: `playwright-report/**`, `test-results/**`,
  `blob-report/**`, `.coverage*`.
- Large lockfiles unless dependency resolution is the task.

## Search Rules

- Use `rg --files` or `rg` with path filters before broad reads.
- Prefer symbol searches over opening whole directories.
- For Python behavior, search `python/dcf_engine`, `python/damodaran_sync`, and
  `python/tests` before reading unrelated docs.
- For frontend behavior, search `app`, `components`, `lib`, `test`, and `e2e`.
- For Convex behavior, search `convex`, `convex_tests`, and related API route
  tests.

## Validation Shape

- Run the narrowest focused check first.
- Escalate to `npm run harness:verify` when the change crosses module
  boundaries or affects PR readiness.
- Add `npm run harness:e2e:smoke` for browser-visible behavior.
