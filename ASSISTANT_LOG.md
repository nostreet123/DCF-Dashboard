# Assistant Collaboration Log

This file tracks two things so I can work better with you over time:
- mistakes I made
- preferences you have shared

## Mistakes

| Date | Task or Context | Mistake | Correction | Guardrail for Next Time |
| --- | --- | --- | --- | --- |
| 2026-02-07 | Implementing company search + statements fixes | I initially wrote a direct route test that imported `next/server` under `node --test`, which failed module resolution. | I extracted fallback behavior into a pure helper (`app/api/company/search/logic.ts`) and tested that logic directly. | Prefer pure logic tests for API behavior when runtime-specific route modules are not portable to the current test runner. |
| 2026-02-08 | Adding engine error mapping tests | I initially imported a module path in a way that `node --test` could not resolve (`ERR_MODULE_NOT_FOUND`). | I removed runtime path-coupled imports in the tested helper and made the mapping helper pure/test-runner-friendly. | When adding Node unit tests, avoid runtime imports that depend on app-only module resolution aliases or extensionless ESM paths. |
| 2026-02-08 | Adding debug-event resilience tests during bug hunt | I initially added a test that imported a module using `@/...` aliases under `node --test`, which failed (`ERR_MODULE_NOT_FOUND`). | I removed the alias-dependent test and kept coverage on alias-safe helpers (`convex.ts`) that validates the same regression path. | For Node unit tests in this repo, avoid importing app modules that depend on Next path aliases unless a compatible resolver is configured. |
| 2026-02-08 | Running full validation during staging probes | I initially ran heavy checks in parallel and interpreted two performance-test failures before isolating them; they were load-induced rather than deterministic regressions. | I reran the failing tests in isolation and confirmed they passed, then reran full suites cleanly. | For timing-sensitive tests, avoid parallel heavy validation jobs when triaging failures; isolate first, then run full suite. |
| 2026-02-08 | Setting a prod env var whose value began with `-` | I first passed the token as a positional CLI argument, and the CLI parsed it as an option. | I retried by piping the value through stdin to `convex env set`, which correctly treated it as literal data. | For secret values that may start with `-`, use stdin-based `env set` to avoid option parsing issues. |
| 2026-02-08 | Adding route smoke tests for mixed runners | I initially placed a Bun-only test under `test/*.test.ts`, causing Node's test runner to execute it and fail on `bun:` imports. | I moved the Bun route smoke test to `convex_tests/` and wired it to a dedicated `test:routes` script. | Keep runner-specific tests in runner-scoped locations and scripts to prevent cross-runner execution. |
| 2026-02-08 | Low-priority bug-hunt hardening for company search and run telemetry | I introduced a fixed 1000-row cap for substring search candidates and measured `persistDurationMs` before awaiting the persistence mutation. | I restored paginated scan coverage across the indexed company set and moved persistence-duration measurement to after the mutation completes. | For search behavior, avoid fixed candidate caps that break completeness; for latency telemetry, measure duration only after awaited operations finish. |

## What You Like

| Date | Preference | How I Will Apply It |
| --- | --- | --- |
| 2026-02-07 | You want a file that tracks my mistakes and what you like. | I will keep this file updated as we work. |
| 2026-02-07 | You want this tracking workflow injected into `AGENTS.md`. | I will keep the policy in `AGENTS.md` and the entries in `ASSISTANT_LOG.md`. |
| 2026-02-07 | You prefer a clear plan before executing larger cleanup/refactor work. | I will propose phased plans first, then execute only after your go-ahead. |
| 2026-02-07 | You prefer end-to-end debug architecture with Convex-first operator access, tiered verbosity, server-generated correlation IDs, strict redaction, and 90d/30d retention defaults. | I will default to this debug pattern when adding observability features unless you specify otherwise. |
| 2026-02-08 | When unrelated edits appear, you prefer I continue without blocking after confirming your preference. | I will pause once to confirm, then proceed while avoiding reverts or cross-contaminating unrelated files. |
| 2026-02-08 | You prefer full execution once a plan is approved. | After presenting a patch plan, I will execute all planned steps end-to-end (code, tests, and smoke verification) unless you scope it down. |
| 2026-02-08 | You prefer in-progress repo changes to be included and refined during execution instead of worked around. | I will integrate with and improve existing in-flight edits when requested, and treat them as part of the active implementation surface. |
| 2026-02-08 | You want a follow-on bug hunt for lower-priority (P2/P3) issues after blocker closure. | I will maintain a separate low-priority bug-hunt board and process in parallel with blocker work. |
| 2026-02-09 | When you invoke a skill directly, you want its default workflow executed immediately. | I will run the skill’s default action first (for `skill-installer`, list available curated skills) and then ask which one(s) to install. |
| 2026-02-09 | You prefer explicit verification before bulk install actions. | For installer workflows, I will verify current installed state, perform installs, and verify again before reporting completion. |
| 2026-02-09 | You prefer skill storage unified across CLIs under `~/.agent/skills`. | I will default to shared skill locations and keep CLI-specific paths compatible via symlinks when migrating. |
| 2026-02-09 | You prefer plural naming for shared multi-CLI paths (`~/.agents/skills`). | I will use `~/.agents/skills` as canonical and keep `~/.agent/skills` and `~/.codex/skills` as compatibility symlinks. |
| 2026-02-09 | You prefer skills physically stored in this repo for unified multi-CLI use. | I will treat `<repo>/.agents/skills` as canonical and point `~/.agents/skills`, `~/.agent/skills`, and `~/.codex/skills` to it via symlinks. |

## Update Rule

After each meaningful task:
1. If I made an error, add one row in `Mistakes`.
2. If you share a preference, add one row in `What You Like`.
