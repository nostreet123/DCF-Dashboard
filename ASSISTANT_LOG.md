# Assistant Collaboration Log

This file tracks two things so I can work better with you over time:
- mistakes I made
- preferences you have shared

Notes:
- This file is stored in the git repo, so its contents are branch-specific.

## Mistakes

| Date | Task or Context | Mistake | Correction | Guardrail for Next Time |
| --- | --- | --- | --- | --- |

## What You Like

| Date | Preference | How I Will Apply It |
| --- | --- | --- |
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

## Update Rule

After each meaningful task:
1. If I made an error, add one row in `Mistakes`.
2. If you share a preference, add one row in `What You Like`.
