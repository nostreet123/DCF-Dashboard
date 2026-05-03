## Problem

- What maintainability, duplication, complexity, or reliability problem does this refactor address?

## Root Cause

- What in the current design or code shape is making change unsafe or expensive?

## PR Size

- [ ] `size/XS` — 0-9 changed lines
- [ ] `size/S` — 10-29 changed lines
- [ ] `size/M` — 30-99 changed lines
- [ ] `size/L` — 100-499 changed lines
- [ ] `size/XL` — 500-999 changed lines
- [ ] `size/XXL` — 1000+ changed lines
- Codex review strategy:
  - `size/XS` / `size/S`: verify the cleanup is behavior-preserving and actually simplifies something
  - `size/M`: review changed boundaries first, then preserved invariants and regression tests
  - `size/L`+: review module by module with findings focused on hidden behavior drift, partial migrations, and broken invariants; split unless the preservation story is still easy to verify

## Summary

- Short high-level overview of the refactor

## Fix

- How this PR improves structure without changing intended behavior

## Changes

- Key structural changes
- Important modules, boundaries, or call paths touched
- Any intentionally preserved interfaces or compatibility constraints

## Refactor Safety

- Expected unchanged behavior
- Invariants that must still hold
- High-risk paths reviewers should compare carefully

## Validation

- Commands run:
  - [ ] `npm test`
  - [ ] `npm run lint`
  - [ ] `npm run build`
  - [ ] `cd python && pytest`
  - [ ] `npx convex typecheck`
- Refactor validation:
  - [ ] Existing tests still cover the preserved behavior
  - [ ] I added targeted tests where the refactor changed internal boundaries or subtle logic
  - [ ] I verified no accidental interface or behavior drift
- Notes:
  - Paste short results, failures, skips, or rationale for omitted checks

## Pre-Open Self-Review

- Code perspective:
  - [ ] I reviewed the diff for hidden behavior changes, stale code, and partial migrations
  - [ ] The refactor meaningfully reduces complexity or improves maintainability
- Security perspective:
  - [ ] I checked whether moved or consolidated logic changes auth, validation, logging, or data-access behavior
  - [ ] Any security-sensitive invariants remain enforced after the refactor
- Functionality perspective:
  - [ ] I verified the main preserved flows still behave the same
  - [ ] I checked likely regression paths around moved code and wiring changes

## Evidence

- Before/after notes, test evidence, architecture notes, or `N/A`

## Changelog

- Usually `N/A` unless there is user-visible behavior or operational impact

## Notes

- Reviewer notes, tradeoffs, or follow-up cleanup work

## Reviewer Focus

- Areas where reviewers should focus for hidden behavior drift
