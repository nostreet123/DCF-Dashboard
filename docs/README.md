# Documentation Hub

Start here for contributor onboarding, product context, and public-release evidence. These docs are written for humans reviewing or running the repo — not for agent-only instructions (see `.gitignore` for local agent files).

## Get Started

| Doc | Purpose |
|-----|---------|
| [ONBOARDING.md](./ONBOARDING.md) | First install, golden paths, and verification |
| [contributor-module-guides.md](./contributor-module-guides.md) | Service ports, canonical code boundaries |
| [../README.md](../README.md) | Project overview, quickstart, and demo paths |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Pull requests, issues, and maintainer settings |
| [../SUPPORT.md](../SUPPORT.md) | How to get help (issues, expectations) |
| [../GOVERNANCE.md](../GOVERNANCE.md) | Maintainer roles and decision process |
| [../RELEASING.md](../RELEASING.md) | Versioning and release checklist |
| [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | Dependency licenses and attribution |

## Product And Modeling

| Doc | Purpose |
|-----|---------|
| [architecture.md](./architecture.md) | System diagram and layer overview |
| [provider-data-flow.md](./provider-data-flow.md) | SEC, Damodaran, Convex, Hugging Face boundaries |
| [showcase.md](./showcase.md) | Screenshots and reviewer-facing product proof |
| [../examples/README.md](../examples/README.md) | Sample request/output payloads |
| [monte-carlo.md](./monte-carlo.md) | Monte Carlo modes and output interpretation |
| [ai-scenario-analysis.md](./ai-scenario-analysis.md) | Server-only AI scenario flow |
| [convex-persistence.md](./convex-persistence.md) | Optional Convex setup and data flow |
| [../DATA_MODEL.md](../DATA_MODEL.md) | Cross-layer data model |
| [web-feature-parity-checklist.md](./web-feature-parity-checklist.md) | Mac prototype parity surface |

## Security And Release

| Doc | Purpose |
|-----|---------|
| [../SECURITY.md](../SECURITY.md) | Vulnerability reporting and safe defaults |
| [../DEPLOY_SECURITY_RUNBOOK.md](../DEPLOY_SECURITY_RUNBOOK.md) | Hosted rollout and rollback |
| [public-release-safety-gate0.md](./public-release-safety-gate0.md) | Redacted secret/history verification |
| [public-repo-audit-phase1.md](./public-repo-audit-phase1.md) | Public-safe vs local-only environment model |
| [public-repo-audit-phase2.md](./public-repo-audit-phase2.md) | Supply-chain and CI posture |
| [verification.md](./verification.md) | Reviewer summary: latest harness pass and three golden-path commands |
| [public-repo-audit-phase3.md](./public-repo-audit-phase3.md) | Detailed clean-clone verification log |

## Roadmap And Impact

| Doc | Purpose |
|-----|---------|
| [../ROADMAP.md](../ROADMAP.md) | Near-term contribution-friendly work |
| [oss-impact.md](./oss-impact.md) | OSS program impact claim ledger (skeleton) |
| [application-readiness.md](./application-readiness.md) | Application narrative for reviewers |
| [oss-program-application.md](./oss-program-application.md) | Consolidated OSS program reviewer pack |
| [releases/v0.1.0.md](./releases/v0.1.0.md) | `v0.1.0` release notes |

## Optional Integrations

Convex, Hugging Face, and SEC EDGAR are **optional**. The mock UI demo and direct compute flow work without them. See [ONBOARDING.md](./ONBOARDING.md) for the minimum paths.
