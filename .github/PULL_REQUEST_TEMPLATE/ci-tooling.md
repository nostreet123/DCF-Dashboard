## Problem

- What CI, tooling, developer workflow, or dependency-management problem does this PR address?

## Root Cause

- What in the current workflow, config, or automation caused the issue?

## PR Size

- [ ] `size/XS` — 0-9 changed lines
- [ ] `size/S` — 10-29 changed lines
- [ ] `size/M` — 30-99 changed lines
- [ ] `size/L` — 100-499 changed lines
- [ ] `size/XL` — 500-999 changed lines
- [ ] `size/XXL` — 1000+ changed lines
- Codex review strategy:
  - `size/XS` / `size/S`: review the exact config delta and its immediate operational effect
  - `size/M`: review permissions, behavior changes, and local/CI impact in separate passes
  - `size/L`+: review workflow by workflow or script by script, starting with the highest-blast-radius changes; split if multiple operational concerns are bundled

## Summary

- Short high-level overview of the tooling change

## Fix

- How this PR improves CI, tooling, or developer workflow behavior

## Changes

- Key config, workflow, or script changes
- Important setup, cache, or environment impact

## Validation

- Commands run:
  - [ ] `npm test`
  - [ ] `npm run lint`
  - [ ] `npm run build`
  - [ ] `cd python && pytest`
  - [ ] `npx convex typecheck`
- Tooling validation:
  - [ ] I validated the changed workflow/config path directly where possible
  - [ ] I checked for unintended local-dev or CI behavior changes
  - [ ] I documented anything that could not be fully exercised locally
- Notes:
  - Paste short results, failures, skips, or rationale for omitted checks

## Pre-Open Self-Review

- Code perspective:
  - [ ] I reviewed scripts/config for accidental unrelated changes
  - [ ] The new workflow or tooling behavior is clear and maintainable
- Security perspective:
  - [ ] I checked permissions, secrets usage, token scope, and supply-chain impact where relevant
  - [ ] The change does not broaden access or expose sensitive runtime details unintentionally
- Functionality perspective:
  - [ ] I verified the developer or CI workflow still works as intended
  - [ ] I checked failure paths, fallbacks, and rollback practicality where relevant

## Evidence

- Workflow logs, config validation output, screenshots, or `N/A`

## Changelog

- Usually `N/A` unless this materially affects users or contributors

## Notes

- Reviewer notes, rollout caveats, or follow-up tooling work

## Reviewer Focus

- Areas where reviewers should focus for workflow reliability and security
