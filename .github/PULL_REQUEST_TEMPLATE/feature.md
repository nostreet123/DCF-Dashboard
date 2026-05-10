## Problem

- What user, product, or operator need does this feature address?

## Root Cause

- What gap in the current product or workflow made this necessary?

## PR Size

- [ ] `size/XS` — 0-9 changed lines
- [ ] `size/S` — 10-29 changed lines
- [ ] `size/M` — 30-99 changed lines
- [ ] `size/L` — 100-499 changed lines
- [ ] `size/XL` — 500-999 changed lines
- [ ] `size/XXL` — 1000+ changed lines
- Codex review strategy:
  - `size/XS` / `size/S`: review the feature intent and confirm scope stayed tight
  - `size/M`: review by primary user flow first, then edge cases and test coverage
  - `size/L`+: review by subsystem in the order users experience it, then inspect integration seams and rollout notes; prefer splitting if multiple feature stories are bundled

## Summary

- Short high-level overview of the feature

## Fix

- How this PR delivers the new capability

## Changes

- Key implementation changes
- Important files, flows, or interfaces touched
- Any new env vars, docs, or operational requirements

## Scope

- Why this feature PR is reviewable as submitted
- Explicitly out of scope
- Follow-up work intentionally deferred

## Validation

- Commands run:
  - [ ] `npm test`
  - [ ] `npm run lint`
  - [ ] `npm run build`
  - [ ] `cd python && pytest`
  - [ ] `npx convex typecheck`
- Feature validation:
  - [ ] Added or updated tests for the new behavior
  - [ ] Verified the main user flow end to end
  - [ ] Verified failure states and empty states where applicable
- Notes:
  - Paste short results, failures, skips, or rationale for omitted checks

## Pre-Open Self-Review

- Code perspective:
  - [ ] I reviewed the diff for unnecessary complexity and unrelated edits
  - [ ] Interfaces, naming, and docs are clear for future maintainers
- Security perspective:
  - [ ] I checked auth, input validation, secrets, logging, and data exposure impact for the new feature
  - [ ] Any new trust boundary or operational assumption is documented
- Functionality perspective:
  - [ ] I verified the primary happy path
  - [ ] I checked realistic edge cases, degraded states, and backwards compatibility impact

## Evidence

- Screenshots, video, request/response examples, logs, or `N/A`

## Changelog

- User-facing changelog entry, release-note summary, or `N/A`

## Notes

- Reviewer notes, tradeoffs, rollout caveats, or follow-ups

## Reviewer Focus

- Areas where reviewers should focus for product correctness and integration risk
