# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` (pre-1.0 public preview) | Yes |
| Tagged releases | Security fixes for the latest tag only |

## Reporting A Vulnerability

Please do not open a public GitHub issue for a suspected security problem.

Instead:

1. Use [GitHub private vulnerability reporting](https://github.com/nostreet123/DCF-Dashboard/security/advisories/new) for this repository when available, or contact the maintainer through GitHub private communication.
2. Include reproduction steps, affected files or routes, and any proof-of-concept details needed to validate the report.
3. Allow time for investigation and coordinated disclosure before public discussion.

## Scope

Security reports are especially useful for:

- auth and authorization bypasses
- secret exposure in the repository, CI, or documented deployment paths
- unsafe defaults in public or hosted deployments (for example local-only bypass flags used as production defaults)
- injection risks
- data access boundary failures

Out of scope: investment outcomes, model accuracy disputes, and optional third-party service availability (SEC EDGAR, Convex, Hugging Face).

## Trust Model

This application does **not** implement end-user authentication. Privilege is enforced with shared service secrets:

- `DAMODARAN_SYNC_TOKEN` — root credential for Convex mutations and sensitive reads. **Never expose to browsers, client bundles, or public docs.**
- `INTERNAL_PERSISTENCE_KEY` — HMAC secret for Next.js persistence routes.
- `DCF_ENGINE_INTERNAL_KEY` — HMAC secret for Next.js → FastAPI requests.

Anyone who learns `DAMODARAN_SYNC_TOKEN` plus your Convex deployment URL can call protected Convex functions directly, bypassing Next.js middleware. Treat sync-token rotation and Convex dashboard access as production security controls.

## Public Data Boundary

Several Convex queries are intentionally callable without authentication when `NEXT_PUBLIC_CONVEX_URL` is set (for example `companies:search`, `companyStatements:listBySymbol`, `reference:getRow`, catalog/sidebar reads). This reflects public SEC and Damodaran reference data, not private user records. Do not store sensitive tenant data in these tables unless you add your own auth layer.

## Safe Defaults (Public Source)

- FastAPI rejects unsigned protected requests unless `DCF_ENGINE_ALLOW_UNSIGNED=1` (local/dev only).
- FastAPI OpenAPI/docs are disabled unless `DCF_ENGINE_EXPOSE_DOCS=1` (local/dev only).
- Secrets belong in environment stores only; see `.env.example` for the public vs server-only split.
- Publish safety evidence: [docs/public-release-safety-gate0.md](docs/public-release-safety-gate0.md) and [docs/public-repo-audit-phase1.md](docs/public-repo-audit-phase1.md).

## Automated Security Checks

Repository CI includes:

- [Secret Scan](.github/workflows/secret-scan.yml) — Gitleaks on pull requests and `main`
- [CodeQL](.github/workflows/codeql.yml) — JavaScript/TypeScript and Python static analysis
- [CI](.github/workflows/ci.yml) — dependency review, npm signature audit, harness verification

Workflows use `pull_request` (not `pull_request_target`) so fork contributions do not receive repository secrets.

## What To Expect

| Stage | Target |
|-------|--------|
| Acknowledgement | Within 3 business days |
| Severity confirmation | Within 7 business days for valid reports |
| Fix or mitigation plan | Communicated after triage; critical issues prioritized |
| Coordinated disclosure | After a fix or documented mitigation is available |

Critical issues affecting published releases receive priority over feature work.
