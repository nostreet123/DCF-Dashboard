## Problem

- What documentation gap, ambiguity, or onboarding problem does this PR address?

## Root Cause

- Why was the current documentation insufficient, misleading, or stale?

## PR Size

- [ ] `size/XS` — 0-9 changed lines
- [ ] `size/S` — 10-29 changed lines
- [ ] `size/M` — 30-99 changed lines
- [ ] `size/L` — 100-499 changed lines
- [ ] `size/XL` — 500-999 changed lines
- [ ] `size/XXL` — 1000+ changed lines
- Codex review strategy:
  - `size/XS` / `size/S`: verify the wording and factual accuracy directly against the repo
  - `size/M`: review commands, paths, and cross-doc consistency as separate checks
  - `size/L`+: review section by section against source-of-truth files and flag drift aggressively when multiple docs must stay aligned

## Summary

- Short high-level overview of the documentation update

## Fix

- How this PR improves clarity, accuracy, or discoverability

## Changes

- Key docs updated
- Any commands, env vars, workflows, or runbooks clarified

## Validation

- Documentation validation:
  - [ ] I checked that commands, paths, and file references are correct
  - [ ] I checked the docs against the current repo state
  - [ ] I updated related docs if this change affects more than one source of truth
- Notes:
  - Paste short results, gaps, or rationale for anything not verified directly

## Pre-Open Self-Review

- Code perspective:
  - [ ] Technical statements match the current code or config
  - [ ] File paths, command names, and env vars are correct
- Security perspective:
  - [ ] The docs do not expose secrets or normalize unsafe production behavior
  - [ ] Any risky local-only shortcuts are clearly labeled as local/dev only
- Functionality perspective:
  - [ ] The documented workflow is something a contributor can actually follow
  - [ ] The updated guidance matches how the product or service behaves today

## Evidence

- Links, screenshots, command output snippets, or `N/A`

## Changelog

- Usually `N/A` unless this documentation change should appear in release notes

## Notes

- Reviewer notes or related docs still worth updating later

## Reviewer Focus

- Places where wording accuracy or repo consistency matters most
