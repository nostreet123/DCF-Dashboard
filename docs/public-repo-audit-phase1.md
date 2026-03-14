# Public Repo Audit - Phase 1

Date: 2026-03-14

Status: PASS locally; force-push rewritten history before public release

## Executive Summary

Current-tree audit found no committed secrets, no tracked `.env` or `.env.local` files, and no leaked sync tokens or internal HMAC keys. The one confirmed historical exposure was a real Convex deployment identifier and subdomain copied into the old `security_best_practices_report.md`. That file has been removed from the working tree and from local git history. Before making the GitHub repository public, force-push the rewritten refs so the hosted remote matches this cleaned local history.

## Secret Scan Summary

Reviewed:
- `.env*` files and committed config
- Next.js, Convex, and FastAPI entry points
- GitHub Actions workflows
- tests, fixtures, and sample data
- git history for tokens, API keys, private keys, real Convex URLs, and internal-only hostnames

Confirmed findings:
- No committed values found for `DAMODARAN_SYNC_TOKEN`, `CONVEX_DEPLOY_KEY`, `DCF_ENGINE_INTERNAL_KEY`, or `INTERNAL_PERSISTENCE_KEY`
- No tracked `.env` or `.env.local` files found in history
- No private key material or common API key formats found in repo history
- One historical metadata leak was found in the removed `security_best_practices_report.md`
  - Included a real `CONVEX_DEPLOYMENT` identifier
  - Included a real `CONVEX_URL` Convex subdomain
  - Did not include active secrets alongside it
  - Local git history has now been rewritten to remove it

## Safe Public Defaults Pass

Implemented:
- FastAPI internal auth is now fail-closed by default
- Unsigned FastAPI access now requires explicit local-only opt-in via `DCF_ENGINE_ALLOW_UNSIGNED=1`
- Next.js refuses unsigned FastAPI calls unless that same local-only opt-in is set
- Next.js rate-limit failures no longer reveal the exact trusted-header assumption in client-facing API responses
- `.env.example` is regrouped into public-safe, private, and never-expose sections
- The old checked-in security report with real deployment metadata was removed from the working tree
- Local git history was rewritten to remove the old report artifact entirely

Residual deployment note:
- FastAPI nonce replay protection is still process-local. That is acceptable for local/dev and a private single-instance engine, but a public multi-worker FastAPI deployment should use shared nonce storage or stay behind a private network boundary.

## Variables Safe For Public Use

These are safe to publish in docs, examples, or browser-exposed config when needed:
- `NEXT_PUBLIC_CONVEX_URL`
- `TABLEDATA_INSERT_MAX_ROWS`
- `DAMODARAN_INSERT_BATCH_MAX_ROWS`
- `DAMODARAN_INSERT_BATCH_MAX_BYTES`
- `DAMODARAN_RATE_LIMIT_SECONDS`
- `DAMODARAN_MIRROR_MANIFEST_URL`
- `DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED`
- `DAMODARAN_SNAPSHOT_BATCH_SIZE`
- `DAMODARAN_SYNC_WORKERS`
- `DAMODARAN_CONDITIONAL_GET`
- `RATE_LIMIT_IDENTITY_SOURCE`
- `RATE_LIMIT_IDENTITY_MODE`
- `DCF_ENGINE_EXPOSE_DOCS`
- `DCF_TRUSTED_PROXY_MODE`
- `MONTE_CARLO_DEPENDENCE`
- `MONTE_CARLO_ONE_FACTOR_LOADING`

## Variables Never To Expose

- `CONVEX_DEPLOY_KEY`
- `DAMODARAN_SYNC_TOKEN`
- `DCF_ENGINE_INTERNAL_KEY`
- `INTERNAL_PERSISTENCE_KEY`

## Sensitive But Not Secret

Do not treat these as public examples even though they are not secret credentials:
- `CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `DCF_ENGINE_URL`
- `DCF_TRUSTED_PROXY_CIDRS`
- `SEC_USER_AGENT`

## Release Step

Before making the GitHub repo public, push the rewritten local history to the hosted remote:

```bash
git push --force --all
git push --force --tags
```

## Pass Condition

This phase passes only when all of the following are true:
- current tree contains no secrets or sensitive deployment metadata
- git history no longer contains the removed report leak
- public deployments keep `DCF_ENGINE_ALLOW_UNSIGNED` unset
- operational secrets remain in environment stores only
