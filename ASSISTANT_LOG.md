# Assistant Collaboration Log

This file tracks two things so I can work better with you over time:
- mistakes I made
- preferences you have shared

Notes:
- This file is stored in the git repo, so its contents are branch-specific.

## Mistakes

| Date | Task or Context | Mistake | Correction | Guardrail for Next Time |
| --- | --- | --- | --- | --- |
| 2026-02-17 | PR #8 CI failure on additive-only tests | I used fixture snapshot identities (`test_dataset/us`) that did not match the resolver output in tests (`test_us_2024/unknown`), causing the additive skip path assertion to fail in CI. | Updated test fixtures to use identities that match resolver behavior in this harness and reran CI. | In sync-process tests, derive fixture identities from resolver behavior (or helper fixtures) before asserting prefetch-based skip paths. |
| 2026-02-17 | Running `gh-fix-ci` on PR #7 | I tried the bundled `inspect_pr_checks.py` script first, but this environment's `gh` CLI does not support `gh pr checks --json`, so the script failed. | Switched to manual fallback commands: `gh pr checks <pr>` and `gh run list --branch <branch>` to verify status. | Check `gh pr checks --help` for `--json` support before using the helper script; if unsupported, use manual `gh` commands immediately. |
| 2026-02-16 | Adding tests/helpers for `companies.search` and backfill behavior | I over-constrained helper return types in `convex/companies.ts`, causing `convex typecheck` to fail. | Refactored helper typing to a shape-preserving generic (`<T extends { _id: unknown }>`), and reran typecheck/tests. | When extracting testable helpers from Convex handlers, preserve document shape with generics instead of narrowing to partial types. |
| 2026-02-16 | Running `gh-address-comments` workflow | I assumed `scripts/fetch_comments.py` existed at repo root and tried to run it before verifying path availability. | Fell back to `gh api graphql` to fetch and enumerate open PR review threads/comments directly. | When a skill references a helper script, verify the file exists first; if missing, use equivalent `gh` API commands and continue without blocking. |
| 2026-02-18 | Trying to make PR #6 mergeable | I started a merge of `origin/main` into an extremely stale PR branch and got the repo stuck in massive conflicts. | Aborted the merge to restore a clean working tree, then created a small branch off `main` for the actual fixes. | Before attempting conflict resolution, inspect `changedFiles/additions` and confirm whether the purported fix already exists on `main`; prefer a minimal PR off `main` over resolving thousands of-file conflicts. |

## What You Like

| Date | Preference | How I Will Apply It |
| --- | --- | --- |
| 2026-02-17 | When setting credentials, you want the safest possible handling (no value echo, minimal exposure). | I will use masked validation/output, avoid printing secret values, and prefer direct secret-store writes over sharing plaintext in chat. |
| 2026-02-17 | You want weekly sync to be additive-only (insert missing snapshots, never overwrite existing Convex snapshot data). | I will default scheduled sync changes to immutable existing snapshots and use explicit additive-only flags/guards in sync workflows. |
| 2026-02-16 | You prefer a clear fix plan before implementing substantial changes. | I will propose a concrete, decision-complete plan first, then execute after you confirm scope. |
| 2026-02-16 | You want subagents used for substantial implementation tasks. | I will launch focused subagents in parallel for analysis/design and then integrate their output into the implementation and verification steps. |
| 2026-02-16 | After I finalize a plan, you want a subagent to review it for feedback and I should incorporate that feedback. | For multi-step plans, I will run a brief plan-review subagent pass before starting implementation, then update the plan if needed. |
| 2026-02-16 | If a session is interrupted, you want me to continue from where I left off. | I will keep a tight checklist and resume the next unfinished step instead of restarting exploration. |
| 2026-02-16 | You prefer full execution once a plan is approved. | After a plan is accepted, I will execute the full sequence (code, tests, smoke checks) unless you scope it down. |
| 2026-02-16 | You want shared skills unified across CLIs and stored in-repo. | I will treat `./.agents/skills` as canonical and avoid splitting skills across multiple home directories. |
| 2026-02-16 | You want complete conversation history pulled from local Codex state when requested. | I will read from `/root/.codex/history.jsonl` and provide a full export with normalized timestamps. |
| 2026-02-16 | You prefer parsimonious solutions (simple, but effective). | I will default to the simplest approach that meets correctness and operational needs, and call out any tradeoffs explicitly. |
| 2026-02-16 | For performance work, you don't want "skips"; you want correctness preserved while improving speed. | I will avoid "skip older rows" style optimizations unless you explicitly approve; performance changes will be paired with correctness checks/tests. |
| 2026-02-16 | For UI validation, you prefer the agent to run a visible (non-headless) browser when practical. | I will use headful Playwright flows (and screenshots/video artifacts) for UI verification unless you ask for headless. |
| 2026-02-16 | You prefer solutions that avoid API keys and minimize always-on server friction. | When designing integrations (proxies/bridges), I will propose low-friction auth and on-demand execution patterns first. |
| 2026-02-16 | When you say "don't modify anything," you want read-only analysis only. | I will restrict to exploration and write-ups (no file edits, no commits) until you explicitly switch to implementation. |
| 2026-02-16 | You want relevant skills applied directly when requested. | When you say "use them," I will execute concrete code changes guided by the matching skills, then verify with typecheck/tests. |
| 2026-02-19 | For stale PRs, you prefer closing out from current `main` with full validation gates instead of reviving old branches. | I will default to proving behavior on `main` with Bun tests, Python pytest, and Convex typecheck before proposing any new PR. |
| 2026-02-19 | When PR history is confusing, you want concrete cleanup actions (not just explanation). | I will post clarifying PR comments and add/maintain a canonical in-repo timeline note to reduce repeated ambiguity. |
| 2026-02-19 | You want third-party Codex skill packs installed end-to-end (skills + agents + runtime dependencies) when requested. | I will install requested skill repos, wire agent configs in `~/.codex/config.toml`, and provision required CLIs/venvs with verification output. |

## Update Rule

After each meaningful task:
1. If I made an error, add one row in `Mistakes`.
2. If you share a preference, add one row in `What You Like`.
