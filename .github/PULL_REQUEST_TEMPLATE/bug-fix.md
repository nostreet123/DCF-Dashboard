## Problem

- What broke, regressed, or behaved incorrectly?

## Root Cause

- What actually caused the bug?

## PR Size

- [ ] `size/XS` — 0-9 changed lines
- [ ] `size/S` — 10-29 changed lines
- [ ] `size/M` — 30-99 changed lines
- [ ] `size/L` — 100-499 changed lines
- [ ] `size/XL` — 500-999 changed lines
- [ ] `size/XXL` — 1000+ changed lines
- Codex review strategy:
  - `size/XS` / `size/S`: confirm the exact bug mechanism and whether the fix is the smallest correct change
  - `size/M`: review root cause first, then the nearby regression surface and test coverage
  - `size/L`+: review by failure path and adjacent flows, with findings focused on hidden regressions; split if the PR mixes bugfix work with unrelated cleanup

## Summary

- Short high-level overview of the fix

## Fix

- How this PR corrects the behavior

## Changes

- Key implementation changes
- Important files, flows, or behavior touched

## Validation

- Commands run:
  - [ ] `npm test`
  - [ ] `npm run lint`
  - [ ] `npm run build`
  - [ ] `cd python && pytest`
  - [ ] `npx convex typecheck`
- Targeted validation:
  - [ ] Added or updated regression coverage
  - [ ] Reproduced the bug before the fix
  - [ ] Verified the bug no longer reproduces after the fix
- Notes:
  - Paste short results, failures, skips, or rationale for omitted checks

## Pre-Open Self-Review

- Code perspective:
  - [ ] I reviewed the diff for accidental refactors, debug code, and unrelated changes
  - [ ] The fix is minimal and does not overreach beyond the bug
- Security perspective:
  - [ ] I checked whether the bug or fix affects auth, input handling, secrets, logging, or data exposure
  - [ ] Any new operational assumptions are documented
- Functionality perspective:
  - [ ] I tested the main regression path end to end
  - [ ] I checked adjacent flows that could realistically regress because of this fix

## Evidence

- Repro steps before / after, screenshots, logs, or request/response examples

## Changelog

- User-facing changelog entry, release-note summary, or `N/A`

## Notes

- Reviewer notes, tradeoffs, follow-ups, or rollout caveats

## Reviewer Focus

- Where reviewers should focus for regression risk
