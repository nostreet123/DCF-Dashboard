---
name: "security-review"
description: "Use when asked to perform a security review, vulnerability audit, or security check on code. Use when writing or reviewing code that handles user input, database queries, authentication, file uploads, API keys, or sensitive data. Triggers for: 'is this secure?', injection checks, XSS review, auth bypass detection, secrets exposure, insecure defaults."
---

# Security Review

Perform a structured security vulnerability review and produce a clear, actionable findings report. Each finding must include file/line, severity, confidence, description, evidence, recommended fix, and (when practical) a suggested test.

## Workflow

### 0. Quick Hotspot Scan (recommended first step)

Run the bundled scanner to surface high-signal hotspots before the manual review. Treats matches as **leads**, not confirmed findings — validate reachability and exploitability in the manual pass.

```bash
python3 scripts/quick_scan.py <repo-root>
python3 scripts/quick_scan.py <repo-root> --show-lines   # include matching line text (secrets always redacted)
python3 scripts/quick_scan.py <repo-root> --output json  # structured output
```

Scans for: hardcoded secrets (redacted), injection primitives, XSS sinks, SSRF primitives, command execution, insecure TLS, insecure CORS.

### 1. Establish Scope and Context

- Identify languages, frameworks, and execution model (server, client, serverless, CLI)
- Map data stores (SQL/NoSQL, file storage, caches) and where raw queries happen
- Identify entry points and trust boundaries:
  - HTTP handlers/routes, background jobs, queues, webhooks, CLI, RPC
  - Templating and HTML rendering surfaces (SSR/CSR)
- Map sensitive data flows: PII, auth tokens, secrets, payments, internal identifiers

Always summarize what you reviewed (key entry points + sensitive flows), especially when there are no findings.

### 2. Check Common Vulnerabilities (must cover all)

**Injection (SQL/NoSQL/command)**
- Dynamic string building in queries
- Unparameterized queries, unsafe ORM "raw" usage
- Shell command construction from user input

**XSS**
- Unsafe HTML rendering, unescaped user input in templates
- Dangerous DOM sinks: innerHTML, eval, dangerous write-to-document patterns

**Authentication/Authorization**
- Missing auth checks on endpoints
- Broken access control, IDOR, missing multi-tenant isolation
- Weak session handling, insecure token verification (e.g. accepting `none` JWT algorithm)
- Privilege escalation paths

**Insecure Data Handling**
- Plaintext secrets or credentials in code/config
- Weak or broken crypto (MD5/SHA1 for passwords, ECB mode, short keys)
- Insecure file storage, unsafe file upload handling
- Path traversal via user-controlled filenames

**Hardcoded Secrets**
- API keys, tokens, private keys, passwords in source code or committed configs

### 3. Check Security Best Practices (must cover all)

- **Input validation**: type/shape/allowlist at boundaries; reject and normalize untrusted input; avoid "parse then trust"
- **Output encoding**: context-appropriate escaping (HTML/JS/URL/SQL contexts)
- **Secure defaults**: least privilege, deny-by-default access controls, safe CORS defaults, secure config defaults
- **Error messages**: no stack traces, internal details, or sensitive data exposed to clients; no reflecting raw upstream errors
- **Logging**: no PII or secrets logged; structured logging with redaction; no full request/response body logging by default

### 4. Optional High-Signal Checks (when relevant)

- **SSRF**: user-controlled URLs, internal network access, cloud metadata endpoint access
- **CSRF**: state-changing routes without CSRF protection when using cookies/session auth
- **Path traversal / file upload**: filenames/paths from user input; validate extensions and MIME type; store outside web root
- **Insecure CORS**: wildcard origins with credentials, reflecting Origin header without validation

### 5. Rate Severity (impact x exploitability)

- **Critical**: auth bypass, RCE, secrets exposure with immediate exploitability
- **High**: injection/XSS with clear exploit path, privilege escalation, data exfiltration
- **Medium**: broken validation, partial info leakage, insecure defaults with existing mitigations
- **Low**: best-practice gaps, hardening suggestions, non-exploitable weaknesses

Include **confidence** per finding:
- **High**: clear data flow + reachable sink + concrete exploit scenario
- **Medium**: likely issue but missing some context (routing, auth model, framework escaping)
- **Low**: smell or hardening suggestion; not clearly exploitable

**Report only findings with confidence >= Medium.**

### 6. Produce Findings Report

Sort findings by severity (Critical -> High -> Medium -> Low). For each finding:

```
N) `path/to/file.ext:line` -- **Severity** (Confidence: Level)
   Description: what is vulnerable and why it matters (impact + exploitability)
   Evidence: endpoint/function + how untrusted input reaches the sink
   Recommended fix: specific change, not vague advice
   Suggested test: unit/integration/e2e test (when practical)
```

If secrets are detected: report file location and secret type only. **Never paste or echo secret values.** Recommend immediate rotation.

If no findings:
```
No security issues found. Reviewed: [summary of entry points, data flows, and areas checked].
```

## Report File (optional)

If the user asks for a written report, save it as `security_review_report.md` (or a location they specify). Include:

1. **Executive Summary** — one paragraph, overall security posture and highest-priority risk
2. **Findings by Severity** — Critical, High, Medium, Low sections with numeric IDs for easy reference
3. **Recommended Next Steps** — ordered by priority

After writing, summarize findings to the user and note the report location.

## Fixes

If producing a report, let the user read it and ask before beginning fixes.

If a Critical finding is detected during normal work, notify the user immediately and ask if they want a fix applied.

When fixing:
- Fix one finding at a time
- Add a brief comment explaining why this fix addresses the vulnerability
- Verify the fix does not break existing functionality — check tests if available
- Follow the project's normal commit/change flow
