#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Rule:
    key: str
    title: str
    description: str
    patterns: list[str]
    redact_lines: bool = False


DEFAULT_EXCLUDE_GLOBS: list[str] = [
    "**/.git/**",
    "**/node_modules/**",
    "**/.venv/**",
    "**/__pycache__/**",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/.pytest_cache/**",
    "**/coverage/**",
]


RULES: list[Rule] = [
    Rule(
        key="secrets",
        title="Hardcoded secrets (high-signal patterns)",
        description="Potential hardcoded credentials/tokens/private keys. Script will NOT print matching lines.",
        patterns=[
            r"-----BEGIN (?:RSA|EC|OPENSSH|PGP) PRIVATE KEY-----",
            r"\bAKIA[0-9A-Z]{16}\b",  # AWS access key id
            r"\bASIA[0-9A-Z]{16}\b",  # AWS temp access key id
            r"\bghp_[A-Za-z0-9]{30,}\b",  # GitHub classic PAT
            r"\bgithub_pat_[A-Za-z0-9_]{30,}\b",  # GitHub fine-grained PAT
            r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b",  # Slack tokens
            r"\bAIza[0-9A-Za-z\-_]{35}\b",  # Google API key
            r"\bsk_(?:live|test)_[0-9a-zA-Z]{16,}\b",  # Stripe secret key
            r"(?i)\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['\"][^'\"\\n]{8,}['\"]",
        ],
        redact_lines=True,
    ),
    Rule(
        key="injection",
        title="Injection primitives (SQL/NoSQL/raw queries)",
        description="Suspicious raw query execution or shell/string interpolation near query execution.",
        patterns=[
            # JavaScript/TypeScript
            r"\b(queryRawUnsafe|executeRawUnsafe)\b",
            r"\b(client|pool)\.query\(",
            r"\b(sequelize|knex)\.raw\(",
            r"\b(mysql|mariadb|pg|postgres)\b.*\bquery\(",
            # Python
            r"\bcursor\.execute\(",
            r"\bexecute\(\s*f[\"']",
            r"\btext\(\s*f[\"']",
        ],
    ),
    Rule(
        key="xss",
        title="XSS sinks / raw HTML rendering",
        description="Places where raw HTML is injected or escaping is bypassed.",
        patterns=[
            r"\bdangerouslySetInnerHTML\b",
            r"\.innerHTML\s*=",
            r"\bdocument\.write\(",
            r"\bv-html\b",
            r"\bng-bind-html\b",
            r"\bmark_safe\b",
            r"\|\s*safe\b",
        ],
    ),
    Rule(
        key="ssrf",
        title="SSRF primitives (user-controlled fetch)",
        description="Network calls that may be influenced by user-controlled URLs/hosts.",
        patterns=[
            r"\bfetch\(",
            r"\baxios\.(get|post|request)\(",
            r"\brequests\.(get|post|request)\(",
            r"\burllib\.request\.urlopen\(",
        ],
    ),
    Rule(
        key="command_exec",
        title="Command execution primitives",
        description="Potential command injection surfaces or risky subprocess usage.",
        patterns=[
            r"\bchild_process\.(exec|execSync)\(",
            r"\bspawn\(",
            r"\bsubprocess\.(run|Popen|call|check_output)\(",
            r"\bshell\s*=\s*True\b",
        ],
    ),
    Rule(
        key="tls",
        title="Insecure TLS / certificate verification disabled",
        description="Requests that skip TLS verification or disable cert checks.",
        patterns=[
            r"\bverify\s*=\s*False\b",
            r"\brejectUnauthorized\s*:\s*false\b",
            r"\bNODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['\"]?0['\"]?\b",
            r"\bcurl\s+-k\b",
        ],
    ),
    Rule(
        key="cors",
        title="Potentially insecure CORS",
        description="Wildcard CORS, reflecting Origin, or credentials + wide origins.",
        patterns=[
            r"Access-Control-Allow-Origin\s*:\s*\*",
            r"Access-Control-Allow-Credentials\s*:\s*true",
            r"\b(cors|CORS)\b.*\b(origin|credentials)\b",
        ],
    ),
]


def _require_rg() -> str:
    rg = shutil.which("rg")
    if not rg:
        raise RuntimeError("ripgrep (rg) is required for quick_scan.py")
    return rg


def _build_rg_cmd(root: Path, patterns: list[str], max_matches: int) -> list[str]:
    cmd: list[str] = [
        _require_rg(),
        "--json",
        "-n",
        "-S",
        "--color=never",
        "--no-heading",
        "--max-count",
        str(max_matches),
    ]
    for glob in DEFAULT_EXCLUDE_GLOBS:
        cmd.extend(["--glob", f"!{glob}"])
    for pattern in patterns:
        cmd.extend(["-e", pattern])
    cmd.append(str(root))
    return cmd


def _parse_rg_json_lines(stdout: str) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for raw_line in stdout.splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            event = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        if event.get("type") != "match":
            continue
        data = event.get("data") or {}
        path_data = data.get("path") or {}
        path_text = path_data.get("text")
        line_number = data.get("line_number")
        lines_data = data.get("lines") or {}
        lines_text = lines_data.get("text") or ""
        if not path_text or not isinstance(line_number, int):
            continue
        matches.append(
            {
                "path": path_text,
                "line": line_number,
                "line_text": lines_text.rstrip("\n"),
            }
        )
    return matches


def _run_rule(root: Path, rule: Rule, max_matches: int) -> list[dict[str, Any]]:
    cmd = _build_rg_cmd(root, rule.patterns, max_matches=max_matches)
    completed = subprocess.run(cmd, capture_output=True, text=True)
    if completed.returncode not in (0, 1):
        raise RuntimeError(
            f"rg failed for rule {rule.key} (exit {completed.returncode}): {completed.stderr.strip()}"
        )
    return _parse_rg_json_lines(completed.stdout)


def _print_text_report(results: dict[str, list[dict[str, Any]]], show_lines: bool) -> None:
    for rule in RULES:
        matches = results.get(rule.key) or []
        print(f"== {rule.title} ==")
        print(rule.description)
        if not matches:
            print("(no matches)\n")
            continue
        for match in matches:
            path = match["path"]
            line = match["line"]
            if rule.redact_lines:
                print(f"- {path}:{line}")
            else:
                line_text = match.get("line_text", "")
                if show_lines:
                    print(f"- {path}:{line}: {line_text}")
                else:
                    print(f"- {path}:{line}")
        print()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Quick, high-signal security hotspot scan (uses ripgrep).",
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Root directory to scan (default: .)",
    )
    parser.add_argument(
        "--max-matches",
        type=int,
        default=50,
        help="Max matches per file per rule (default: 50)",
    )
    parser.add_argument(
        "--show-lines",
        action="store_true",
        help="Include matching line text for non-secret rules (secrets are never printed).",
    )
    parser.add_argument(
        "--output",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text).",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"Root does not exist: {root}", file=sys.stderr)
        return 2

    try:
        _require_rg()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    results: dict[str, list[dict[str, Any]]] = {}
    for rule in RULES:
        results[rule.key] = _run_rule(root, rule, max_matches=args.max_matches)

    if args.output == "json":
        payload: dict[str, Any] = {
            "root": str(root),
            "rules": [
                {
                    "key": rule.key,
                    "title": rule.title,
                    "description": rule.description,
                    "matches": [
                        (
                            {"path": m["path"], "line": m["line"]}
                            if rule.redact_lines
                            else {"path": m["path"], "line": m["line"], "line_text": m.get("line_text", "")}
                        )
                        for m in (results.get(rule.key) or [])
                    ],
                }
                for rule in RULES
            ],
        }
        print(json.dumps(payload, indent=2))
        return 0

    _print_text_report(results, show_lines=bool(args.show_lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

