---
name: code-security-review
description: Comprehensive security review of codebases, PRs, or services. Use when asked to audit for vulnerabilities (injection incl. SQL/NoSQL/raw queries, XSS, auth/authorization issues, insecure data handling, hardcoded secrets) and security best practices (input validation, output encoding, secure defaults, safe error messages, safe logging/redaction), reporting findings with file/line, severity, description, and recommended fix.
---

# Code Security Review

## Overview

Perform a structured security review of source code and produce a clear, actionable findings report. Each finding must include file/line, severity, description, and recommended fix, plus confidence, evidence pointer, and (when practical) a suggested test.

## Workflow

### 0) Quick hotspot scan (recommended)

Run the bundled scanner to quickly surface high-signal hotspots (this is *not* a vulnerability report; it is a review accelerator):

- `python3 scripts/quick_scan.py <repo-root>`
- Optional: `--output json` for structured output

Notes:
- Matches are **leads**, not findings. Validate reachability and exploitability in the manual pass.
- For secrets, the script reports `file:line` only and **never prints matching lines**.

### 1) Establish scope and context

- Identify languages/frameworks and execution model (server, client, serverless, CLI).
- Identify data stores (SQL/NoSQL, file storage, caches) and where raw queries happen.
- Identify entry points and trust boundaries:
  - HTTP handlers/routes, background jobs, queues, CLI, webhooks, RPC handlers.
  - Templating and HTML rendering surfaces (SSR/CSR).
- Map sensitive data flows (PII, auth tokens, secrets, payment, internal identifiers).

For reporting, always summarize what you reviewed (key entry points + sensitive flows), especially when there are no findings.

### 2) Check common vulnerabilities (must cover all)

- **Injection (SQL/NoSQL/raw queries)**: dynamic string building, unparameterized queries, unsafe ORM “raw” escapes, unsafe query DSL building from user input.
- **XSS**: unsafe HTML rendering, unescaped user input in templates, dangerous DOM sinks.
- **Authentication/authorization**: missing auth checks, broken access control, IDOR, weak session handling, insecure token verification, missing tenant checks.
- **Insecure data handling**: plaintext secrets, weak crypto, insecure storage, unsafe file uploads.
- **Hardcoded secrets/credentials**: API keys, tokens, private keys, credentials in code or configs.

### 3) Check security best practices (must cover all)

- **Input validation**: type/shape/allowlist validation at boundaries; reject/normalize untrusted input; avoid “parse then trust”.
- **Output encoding**: context-appropriate escaping in HTML/JS/URL/SQL contexts.
- **Secure defaults**: least privilege, secure config defaults, deny-by-default access controls, safe CORS defaults.
- **Error messages**: avoid leaking internal details, stack traces, or sensitive data; avoid reflecting raw upstream responses to clients.
- **Logging**: ensure no sensitive data is logged; prefer structured logs with redaction; avoid logging full request/response bodies by default.

### 4) Optional high-signal checks (do when relevant)

- **SSRF**: user-controlled URLs, internal network access, metadata endpoints.
- **CSRF**: state-changing routes without CSRF protections when using cookies/session auth.
- **Path traversal / file upload**: filenames/paths from user input; validate extensions/MIME; store outside web root; scan if applicable.
- **Insecure CORS**: wildcard origins with credentials, reflecting Origin.

### 5) Rate severity consistently (impact × exploitability)

- **Critical**: auth bypass, RCE, secrets exposure with immediate exploitability.
- **High**: injection/XSS with clear exploit path, privilege escalation, data exfiltration.
- **Medium**: broken validation, partial info leakage, insecure defaults with mitigations.
- **Low**: best-practice gaps, hardening suggestions, non-exploitable weaknesses.

Always include **confidence** per finding:
- **High**: clear data flow + reachable sink + exploit scenario.
- **Medium**: likely issue but missing some context (routing, auth model, framework escaping).
- **Low**: smells/hardening suggestion; not clearly exploitable.

### 6) Produce findings report

For **each issue found**, provide:
- **File and line number**
- **Severity** (Critical/High/Medium/Low)
- **Confidence** (High/Medium/Low)
- **Description of vulnerability** (impact + exploitability)
- **Evidence pointer** (endpoint/function + how untrusted input reaches the sink)
- **Recommended fix** (specific change, not vague advice)
- **Suggested test** (unit/integration/e2e), when practical

If secrets are detected, **do not paste them**; report location, type, and immediate remediation (remove, rotate, invalidate).

## Output format

Sort findings by severity (**Critical → Low**). Use a numbered list. Example:

1) `path/to/file.ext:123` — **High** (Confidence: High)  
   Description: …  
   Evidence: …  
   Recommended fix: …  
   Suggested test: …

If there are no findings, output:

No security issues found. Reviewed: [summary of areas].
