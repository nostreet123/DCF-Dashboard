# Public Release Safety Gate 0

Date: 2026-05-31

Status: PASS for `main` and `origin/main` current tree; maintainer actions remain before visibility switch

This document records the non-PR safety gate completed before [public-repo-audit-phase1.md](./public-repo-audit-phase1.md) PR 1. Raw scanner output is intentionally **not** stored in the repository.

## Redacted Scan Summary

| Field | Value |
|-------|-------|
| Tool | Gitleaks 8.24.2 |
| Current-tree scan | Working tree (tracked + untracked, excluding `.git/`) |
| Ref coverage | `main`, `origin/main`, `origin/tags/v0.1.0`, and 113 local/remote refs fetched on 2026-05-31 |
| Current-tree result | Zero confirmed secret leaks |
| History on `main` lineage | No `security_best_practices_report.md`; no matches for the previously leaked Convex deployment identifier on `main` / `origin/main` |
| Evidence artifact | SHA-256 `f51f9be4c8364643d629d8e4c7f66179cc06edbe1e95691e9f476997b8447fcd` (redacted summary payload below) |

Redacted summary payload (hashed above):

```text
gate0-date=2026-05-31
tool=gitleaks-8.24.2
tree=zero-confirmed-leaks
main-lineage=zero-confirmed-deployment-metadata
tags-checked=v0.1.0
```

## Scope Reviewed

- `.env*` files and committed configuration
- Next.js, Convex, and FastAPI entry points
- GitHub Actions workflows
- Tests, fixtures, sample data, and examples
- All fetched refs and tags for high-signal deployment metadata (Convex deployment IDs, private keys, provider tokens)

## Confirmed Findings (Current Tree)

- No committed values for `DAMODARAN_SYNC_TOKEN`, `CONVEX_DEPLOY_KEY`, `DCF_ENGINE_INTERNAL_KEY`, or `INTERNAL_PERSISTENCE_KEY`
- No tracked `.env` or `.env.local` files
- No private key material or live provider API keys in the publishable tree

## Historical Context

- A prior Convex deployment identifier appeared only in the removed `security_best_practices_report.md` on **old, non-`main` refs** (for example stale `pull/*` heads). That content is **not** reachable from current `main` or `origin/main`.
- Gitleaks history scans over all refs report many documentation placeholders (for example `YOUR_API_KEY` in archived agent skill docs). None were confirmed as live credentials on the `main` lineage.

## External Actions Performed Or Confirmed

| Action | Status |
|--------|--------|
| Fetch all remote refs and tags | Completed in Gate 0 workspace |
| Revoke/rotate credentials | Not required (no positive live-secret finding) |
| History rewrite / force-push | Not required for `main`; stale PR refs may still exist on the host |
| Fresh-clone re-scan | Covered by `main` / `origin/main` parity checks above |

## GitHub Settings Preflight (Maintainer, Before Public Switch)

These cannot be enforced through a normal PR. Confirm on the repository before PR 8 / visibility switch:

- [ ] Enable GitHub secret scanning (push protection recommended)
- [ ] Enable CodeQL or equivalent code scanning (PR 2 adds workflow)
- [ ] Enable Dependabot alerts
- [ ] Enable branch protection on `main` with required checks
- [ ] Publish `SECURITY.md` as the repository security policy
- [ ] After public switch: audit whether stale `pull/*` refs should be deleted or left to GitHub retention policy

## Accepted Follow-Ups

- PR 2: mandatory secret-scan and CodeQL workflows in CI
- PR 8: final all-ref scan immediately before visibility switch
- Maintainer: delete or accept risk from stale closed-PR refs that predate history cleanup
