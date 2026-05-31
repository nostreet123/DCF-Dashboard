# Roadmap

This roadmap is intentionally short and public-facing. Each item includes acceptance criteria so contributors know when it is done.

## Current Milestone: Public Preview Follow-Up

| Item | Acceptance criteria |
|------|---------------------|
| Onboarding hub | [`docs/ONBOARDING.md`](docs/ONBOARDING.md) is the default first-run link from README and CONTRIBUTING |
| Docs hub | [`docs/README.md`](docs/README.md) links resolve; no orphan audit-only paths for golden paths |
| Product proof | Showcase images exist in-repo and match current UI (see PR 4) |
| Clean-clone evidence | Documented harness commands pass on supported environments (see PR 5) |
| Security CI | Secret scan + CodeQL workflows green on `main` (done in PR 2) |
| Governance pack | GOVERNANCE, SUPPORT, THIRD_PARTY_NOTICES (see PR 6) |

## Next Up

| Item | Acceptance criteria |
|------|---------------------|
| More sample valuations | At least two additional documented payloads with expected output shapes |
| Convex onboarding | Single doc path from zero → `bunx convex dev` → persisted run visible in UI |
| DCF caveats explainers | Short doc section on model limits linked from README disclaimer |
| Integration test coverage | Tests for signed Next.js → FastAPI path documented in CONTRIBUTING |
| Hosted deployment guide | Optional deploy doc that never sets local-only bypass flags |

## Not In Scope Right Now

- Multi-tenant SaaS, billing, or org management
- Real-time market data as a default requirement
- Claiming production SaaS maturity for OSS program reviewers

## How To Pick Work

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ONBOARDING.md](docs/ONBOARDING.md)
2. Choose an item above or open a `feature` / `documentation` issue
3. Reference the acceptance criteria in your PR description
