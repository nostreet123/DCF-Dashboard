# Verification (Public Reviewer Summary)

This page is the short evidence index for clean-clone reproducibility. For step-by-step golden paths and the full command log, see [public-repo-audit-phase3.md](./public-repo-audit-phase3.md).

## Latest clean-clone run

| Field | Value |
|-------|--------|
| Date (UTC) | 2026-05-31T20:49Z |
| Git ref | `main` @ `3446afc` (OSS PRs 1–8 + Codex fixes #115) |
| Environment | Cursor Cloud Ubuntu, Node 22, Python 3.12, `.venv` at repo root |
| Full harness | `npm run harness:verify` — **PASS** |

## Three commands reviewers can trust

After [ONBOARDING.md](./ONBOARDING.md) install steps:

| Goal | Command | Pass criterion |
|------|---------|----------------|
| Mock UI in minutes | `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo npm run dev` | Dashboard at http://127.0.0.1:3000 with mock tickers |
| Compute without UI | `npm run demo:compute` | JSON with fair values + Monte Carlo percentiles |
| Repo alive | `npm run smoke:alive` | Bun focused tests + pytest smoke — exit 0 |

Committed sample output for the workbench demo payload: [`examples/workbench-demo-output.json`](../examples/workbench-demo-output.json). Regenerate after engine changes:

```bash
npm run demo:compute > examples/workbench-demo-output.json
```

## Maintainer / CI parity

Contributors and agents should use the same bar as CI:

```bash
npm run harness:verify
```

That runs repo invariants, Bun tests, Python pytest, typechecks, Convex typecheck, lint, and production build.

## Related evidence

- [public-repo-audit-phase3.md](./public-repo-audit-phase3.md) — detailed audit log
- [ONBOARDING.md](./ONBOARDING.md) — first-run install and golden paths
- [examples/README.md](../examples/README.md) — payload catalog and curl examples
- [oss-impact.md](./oss-impact.md) — claim ledger with PR links
