<!--
PR best practices for this repo:
- Keep the PR focused and reviewable; split unrelated work into separate PRs.
- Open as Draft until the change, validation, and docs are ready for real review.
- Link the issue with a closing keyword when applicable, for example: Fixes #123.
- Call out risky areas, config/env changes, and reviewer focus explicitly.
- Include screenshots, recordings, or request/response examples when they materially help review.
-->

## PR Type

- [ ] Bug fix
- [ ] Security fix
- [ ] Feature
- [ ] Refactor
- [ ] Docs only
- [ ] CI / tooling

## PR Stage

- [ ] Ready for review
- [ ] Draft PR
- Draft reason if not ready:
  -

## PR Size

- [ ] `size/XS` — 0-9 changed lines
- [ ] `size/S` — 10-29 changed lines
- [ ] `size/M` — 30-99 changed lines
- [ ] `size/L` — 100-499 changed lines
- [ ] `size/XL` — 500-999 changed lines
- [ ] `size/XXL` — 1000+ changed lines
- Review strategy (by size):
  - `size/XS` / `size/S`: one-pass findings-first review; check stated intent, exact diff correctness, and obvious regressions
  - `size/M`: review hotspot-first by behavior slice; trace callers/callees, then verify targeted tests and edge cases
  - `size/L`: review subsystem by subsystem; focus first on the riskiest paths, then check rollout notes, compatibility, and missing verification
  - `size/XL` / `size/XXL`: strongly prefer splitting before merge; if kept whole, review in ordered slices with the highest-risk subsystem first and require especially strong evidence, reviewer focus notes, and explicit out-of-scope boundaries

## Linked Issue / Context

- `Fixes #`
- Related docs, design note, incident, or audit reference:
  -

## Problem

- What issue, gap, or risk does this PR address?

## Root Cause

- What caused the issue or made the gap possible?

## Summary

- Short high-level overview of the change

## Fix

- How this PR solves the problem

## Changes

- Key implementation changes
- Important files, flows, or behavior touched
- Any public or internal interface changes

## Scope

- Why this PR is intentionally small enough to review well
- Explicitly out of scope
- Follow-up work intentionally deferred

## Validation

- Commands run:
  - [ ] `npm test`
  - [ ] `npm run lint`
  - [ ] `npm run build`
  - [ ] `cd python && pytest`
  - [ ] `npx convex typecheck`
- Additional targeted checks:
  - [ ] Targeted unit/integration/e2e tests were run where relevant
  - [ ] I verified the changed behavior manually if automation was not enough
- Notes:
  - Paste short results, failures, skips, or rationale for omitted checks

## Pre-Open Self-Review

- Code review:
  - [ ] I reviewed the diff for accidental debug code, dead code, noisy formatting, and unrelated edits
  - [ ] Naming, comments, and structure are clear enough for another engineer to maintain
  - [ ] The implementation matches the stated fix and does not silently change unrelated behavior
- Security review:
  - [ ] I checked auth, authorization, secrets, input handling, logging, and rate-limiting impact where relevant
  - [ ] No sensitive values, internal endpoints, or unsafe defaults were introduced
  - [ ] New config or operational assumptions are documented
- Functional review:
  - [ ] I verified the main user or operator flow end to end
  - [ ] Edge cases and failure paths touched by this PR were reviewed
  - [ ] Validation evidence below matches the actual behavior change

## Evidence

- UI changes: screenshots / video / `N/A`
- API or backend changes: sample request/response, logs, metrics, or `N/A`

## Changelog

- User-facing changelog entry, release-note summary, or `N/A`

## Security Considerations

- Auth, secrets, input validation, rate limiting, or data exposure impact, or `N/A`
- For security fixes: summarize the abuse path and why the new behavior is safer

## Refactor Safety

- For refactors: what behavior should remain unchanged?
- What invariants, compatibility expectations, or risky call paths should reviewers double-check?

## Notes

- Reviewer notes, tradeoffs, follow-ups, or rollout caveats

## Risk / Ops Check

- [ ] No new secrets or private endpoints were added
- [ ] New env vars, setup changes, or optional services are documented
- [ ] Docs were updated for behavior, config, or security changes
- [ ] User-facing behavior changes are described in this PR body
- [ ] Backward compatibility impact is called out if applicable
- [ ] Rollout or rollback considerations are documented if applicable
- [ ] Security-sensitive details are appropriate for a public PR body

## Reviewer Focus

- Areas where feedback is most useful
- Known tradeoffs or intentionally deferred follow-ups
