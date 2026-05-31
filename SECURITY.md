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

## Safe Defaults (Public Source)

- FastAPI rejects unsigned protected requests unless `DCF_ENGINE_ALLOW_UNSIGNED=1` (local/dev only).
- FastAPI OpenAPI/docs are disabled unless `DCF_ENGINE_EXPOSE_DOCS=1` (local/dev only).
- Secrets belong in environment stores only; see `.env.example` for the public vs server-only split.
- Publish safety evidence: [docs/public-release-safety-gate0.md](docs/public-release-safety-gate0.md) and [docs/public-repo-audit-phase1.md](docs/public-repo-audit-phase1.md).

## What To Expect

The maintainer will acknowledge triage as quickly as possible, confirm whether the issue is in scope, and communicate remediation or disclosure timing once the problem is understood. Critical issues affecting published releases receive priority over feature work.
