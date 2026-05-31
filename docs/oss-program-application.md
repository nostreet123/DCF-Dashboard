# OSS Program Application Pack

Single entry point for program reviewers evaluating DCF Dashboard. Every link below points at **merged** repository artifacts on `main` — not draft PRs.

**Repository:** https://github.com/nostreet123/DCF-Dashboard  
**License:** MIT ([LICENSE](../LICENSE))  
**Status:** Public-preview open source (not a hosted SaaS)

## One-paragraph summary

DCF Dashboard is an open-source valuation workbench that pairs a Next.js UI with a Python DCF engine. Reviewers can run a **mock UI demo in minutes** without API keys, run **headless compute** via `npm run demo:compute`, and inspect architecture, security CI, and governance docs in-tree. Optional Convex persistence, Hugging Face AI, and live SEC EDGAR paths are documented but not required to prove usefulness.

## 15-minute reviewer script

```bash
git clone https://github.com/nostreet123/DCF-Dashboard.git
cd DCF-Dashboard
npm ci
python3 -m venv .venv && . .venv/bin/activate
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt

# Path A — mock UI (fastest)
NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev
# open http://127.0.0.1:3000

# Path B — compute only (no UI)
npm run demo:compute

# Path C — repo health
npm run smoke:alive
```

Expected results are documented in [verification.md](./verification.md).

## Evidence map (PR train 1–6)

| Topic | Document |
|-------|----------|
| Secret / history safety (redacted) | [public-release-safety-gate0.md](./public-release-safety-gate0.md) |
| Safe defaults vs local-only flags | [public-repo-audit-phase1.md](./public-repo-audit-phase1.md) |
| Supply chain + CI | [public-repo-audit-phase2.md](./public-repo-audit-phase2.md), README CI badges |
| Clean clone + harness | [verification.md](./verification.md), [public-repo-audit-phase3.md](./public-repo-audit-phase3.md) |
| Product proof (screenshots) | [showcase.md](./showcase.md), [docs/assets/](./assets/) |
| Architecture | [architecture.md](./architecture.md), [provider-data-flow.md](./provider-data-flow.md) |
| Onboarding | [ONBOARDING.md](./ONBOARDING.md), [docs/README.md](./README.md) |
| Governance | [GOVERNANCE.md](../GOVERNANCE.md), [SUPPORT.md](../SUPPORT.md), [RELEASING.md](../RELEASING.md) |
| Licenses | [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |
| Security reporting | [SECURITY.md](../SECURITY.md) |
| Impact claims ledger | [oss-impact.md](./oss-impact.md) |

## Maintainer narrative

See [application-readiness.md](./application-readiness.md) for why this repo is actively maintained (cross-stack docs, tests, security, releases) and how sustained review capacity helps.

## Boundaries (honest scope)

- Outputs are for **modeling and education**, not investment advice ([README](../README.md) disclaimer).
- `"private": true` in `package.json` means the app is not published to npm; the **source** is MIT-licensed.
- Local-only bypass flags (`DCF_ENGINE_ALLOW_UNSIGNED`, `DCF_RATE_LIMIT_ALLOW_LOCALHOST`) are for development — production deploy docs must not treat them as defaults ([DEPLOY_SECURITY_RUNBOOK.md](../DEPLOY_SECURITY_RUNBOOK.md)).
- Multi-tenant SaaS, billing, and org management are **out of scope** ([ROADMAP.md](../ROADMAP.md)).

## Suggested application answers

| Prompt | Pointer |
|--------|---------|
| What does the project do? | [README.md](../README.md) — first three sections |
| How do you verify it works? | [verification.md](./verification.md) |
| How do you handle security? | [SECURITY.md](../SECURITY.md), secret-scan + CodeQL workflows |
| License and attribution | [LICENSE](../LICENSE), [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |
| How can others contribute? | [CONTRIBUTING.md](../CONTRIBUTING.md), [SUPPORT.md](../SUPPORT.md) |

## Pre-public switch (maintainer only)

GitHub repository settings and a final all-ref scan: [public-release-checklist.md](./public-release-checklist.md) and [public-release-safety-gate0.md](./public-release-safety-gate0.md).
