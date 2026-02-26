#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.agents/skills}"
ALLOWLIST_JSON=".agent/scripts/claude_rewrite_allowlist.json"
CLASSIFIED_CSV=".agent/tmp/claude_mentions.classified.csv"
TMP_FILE=".agent/tmp/claude_mentions.guard_check.txt"

mkdir -p .agent/tmp
rg -n --hidden --glob "$ROOT/**" -S "\bClaude\b|\bCLAUDE\b|\bclaude\b" "$ROOT" > "$TMP_FILE" || true

python3 - <<'PY'
from __future__ import annotations
import csv
import json
import re
from pathlib import Path

allow = json.loads(Path('.agent/scripts/claude_rewrite_allowlist.json').read_text(encoding='utf-8'))
protected_paths = allow.get('protected_path_fragments', [])
protected_fragments = allow.get('protected_line_fragments', [])
protected_regex = [re.compile(p) for p in allow.get('protected_line_regex', [])]
manual_fragments = allow.get('manual_line_fragments', [])

classified_buckets: dict[str, str] = {}
classified_path = Path('.agent/tmp/claude_mentions.classified.csv')
if classified_path.exists():
    for row in csv.DictReader(classified_path.open()):
        classified_buckets[f"{row['path']}:{row['line']}"] = row['bucket']

lines = Path('.agent/tmp/claude_mentions.guard_check.txt').read_text(encoding='utf-8').splitlines()
unapproved = []
for raw in lines:
    if not raw.strip():
        continue
    path, rest = raw.split(':', 1)
    line_no, text = rest.split(':', 1)
    text = text.strip()

    key = f"{path}:{line_no}"
    bucket = classified_buckets.get(key)
    if bucket in {'rewrite_with_manual_review', 'protected_runtime_identifier', 'protected_legacy_source'}:
        continue

    approved = False
    for frag in protected_paths:
        if frag in path or frag in text:
            approved = True
            break
    if not approved:
        for frag in protected_fragments:
            if frag in text:
                approved = True
                break
    if not approved:
        for pat in protected_regex:
            if pat.search(text):
                approved = True
                break
    if not approved:
        for frag in manual_fragments:
            if frag in text:
                approved = True
                break

    if not approved:
        unapproved.append(raw)

if unapproved:
    print(f"UNAPPROVED_COUNT={len(unapproved)}")
    for row in unapproved[:200]:
        print(row)
    raise SystemExit(1)

print('UNAPPROVED_COUNT=0')
PY
