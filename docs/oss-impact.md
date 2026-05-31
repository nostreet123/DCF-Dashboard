# OSS Impact Claim Ledger

Status: **skeleton** — claims below are hypotheses to prove during the public-readiness PR train (PRs 4–7). Do not cite as outcomes until linked evidence merges.

## Target Users

| Audience | Need | Status |
|----------|------|--------|
| Students and self-directed learners | Reproducible DCF workflow with visible assumptions | Claim — prove via onboarding + examples (PR 5) |
| Indie builders and OSS contributors | Hackable valuation stack (Next.js + Python) | Claim — prove via harness + architecture docs (PR 4) |
| Maintainers / reviewers | Safe public defaults and verifiable demos | In progress — Gate 0 + PRs 1–2 merged |

## Reviewer-Facing Value

| Claim | Proof needed | Owner PR |
|-------|--------------|----------|
| Clone → demo in under five minutes (mock path) | [ONBOARDING.md](./ONBOARDING.md) + passing smoke | PR 3 (this doc), PR 5 (verification) |
| Clone → compute without private services | `npm run demo:compute` + sample output | PR 5 |
| Security posture visible in CI | Secret scan + CodeQL badges on README | PR 2 merged |
| Product understandable without running | Showcase screenshots + architecture | PR 4 |
| Honest public-preview boundaries | README + roadmap scope | PR 3 |

## Maintainer Need

| Need | Why | Support would unlock |
|------|-----|----------------------|
| Sustained triage and review | Public surface is growing across docs, CI, and optional integrations | Faster PR turnaround, issue hygiene |
| Media and verification refresh | Screenshots and sample outputs drift with UI changes | Dedicated release QA per tag |
| Optional data pipelines | Convex / Damodaran sync are powerful but heavy for casual contributors | Documented contributor rotations for sync maintenance |

## Claims To Prove (Not Yet Evidence)

- [ ] OSS program reviewers can complete mock demo from clean clone in one session
- [ ] Showcase media reflects current UI (redaction-reviewed)
- [ ] Application pack cites only merged verification artifacts
- [ ] No hosted deployment docs recommend local-only bypass flags

## Evidence Index (fill as PRs merge)

| Artifact | PR | Link |
|----------|-----|------|
| Redacted secret scan summary | 1 | [public-release-safety-gate0.md](./public-release-safety-gate0.md) |
| Security CI workflows | 2 | [.github/workflows/secret-scan.yml](../.github/workflows/secret-scan.yml) |
| Onboarding hub | 3 | [ONBOARDING.md](./ONBOARDING.md) |
| Showcase + architecture | 4 | [showcase.md](./showcase.md), [architecture.md](./architecture.md), [provider-data-flow.md](./provider-data-flow.md) |
| Clean-clone verification | 5 | _pending_ |
| Governance + notices | 6 | _pending_ |
| Program application pack | 7 | _pending_ |
