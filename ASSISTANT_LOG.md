# Assistant Collaboration Log

This file tracks two things so I can work better with you over time:
- mistakes I made
- preferences you have shared

## Mistakes

| Date | Task or Context | Mistake | Correction | Guardrail for Next Time |
| --- | --- | --- | --- | --- |
| 2026-02-07 | Implementing company search + statements fixes | I initially wrote a direct route test that imported `next/server` under `node --test`, which failed module resolution. | I extracted fallback behavior into a pure helper (`app/api/company/search/logic.ts`) and tested that logic directly. | Prefer pure logic tests for API behavior when runtime-specific route modules are not portable to the current test runner. |

## What You Like

| Date | Preference | How I Will Apply It |
| --- | --- | --- |
| 2026-02-07 | You want a file that tracks my mistakes and what you like. | I will keep this file updated as we work. |
| 2026-02-07 | You want this tracking workflow injected into `AGENTS.md`. | I will keep the policy in `AGENTS.md` and the entries in `ASSISTANT_LOG.md`. |

## Update Rule

After each meaningful task:
1. If I made an error, add one row in `Mistakes`.
2. If you share a preference, add one row in `What You Like`.
