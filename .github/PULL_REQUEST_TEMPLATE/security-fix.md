## Problem

- What vulnerability, abuse path, or security weakness does this PR address?

## Root Cause

- What design gap, implementation flaw, or missing guard allowed it?

## PR Size

- [ ] `size/XS` — 0-9 changed lines
- [ ] `size/S` — 10-29 changed lines
- [ ] `size/M` — 30-99 changed lines
- [ ] `size/L` — 100-499 changed lines
- [ ] `size/XL` — 500-999 changed lines
- [ ] `size/XXL` — 1000+ changed lines
- Review strategy (by size):
  - `size/XS` / `size/S`: verify the abuse path directly and confirm the new behavior fails closed
  - `size/M`: review threat reduction first, then compatibility and security-test coverage
  - `size/L`+: review auth, validation, logging, rate limiting, and data exposure as separate passes; split if the hardening story cannot be audited confidently in one review

## Summary

- Short high-level overview of the hardening change

## Fix

- How this PR blocks or reduces the abuse path

## Changes

- Key implementation changes
- Important auth, validation, logging, rate-limit, or config behavior touched

## Validation

- Commands run:
  - [ ] `npm test`
  - [ ] `npm run lint`
  - [ ] `npm run build`
  - [ ] `cd python && pytest`
  - [ ] `npx convex typecheck`
- Security validation:
  - [ ] Added or updated tests for the abuse path
  - [ ] Verified the old behavior would have been unsafe or insufficient
  - [ ] Verified the new behavior fails closed where intended
- Notes:
  - Paste short results, failures, skips, or rationale for omitted checks

## Pre-Open Self-Review

- Code perspective:
  - [ ] I reviewed the diff for accidental behavior changes outside the hardening scope
  - [ ] Error handling and failure-mode behavior are explicit and intentional
- Security perspective:
  - [ ] I reviewed auth, authorization, secrets, input handling, output exposure, logging, and rate limiting
  - [ ] The PR body is safe for a public repository and does not reveal sensitive exploit details beyond what is appropriate
  - [ ] New security assumptions, env vars, or rollout steps are documented
- Functionality perspective:
  - [ ] I verified legitimate traffic still works
  - [ ] I verified expected denied / unauthorized / rate-limited paths still return the intended status codes

## Security Considerations

- Abuse path summary
- Residual risk
- Rollout / rollback notes

## Evidence

- Targeted tests, logs, request/response examples, or `N/A`

## Changelog

- User-facing changelog entry, release-note summary, or `N/A`

## Notes

- Reviewer notes, tradeoffs, or follow-up hardening work

## Reviewer Focus

- Areas where reviewers should pressure-test the security model
