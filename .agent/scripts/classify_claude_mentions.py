#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

INPUT = Path('.agent/tmp/claude_mentions.before.txt')
OUTPUT = Path('.agent/tmp/claude_mentions.classified.csv')
ALLOWLIST = Path('.agent/scripts/claude_rewrite_allowlist.json')

MANUAL_EXTS = {'.py', '.sh', '.bash', '.zsh', '.json', '.yaml', '.yml', '.toml'}


def load_allowlist() -> tuple[list[str], list[str], list[re.Pattern[str]], list[str]]:
    data = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
    protected_paths = list(data.get('protected_path_fragments', []))
    protected_fragments = list(data.get('protected_line_fragments', []))
    protected_regex = [re.compile(p) for p in data.get('protected_line_regex', [])]
    manual_fragments = list(data.get('manual_line_fragments', []))
    return protected_paths, protected_fragments, protected_regex, manual_fragments


def classify(path: str, text: str, protected_paths: list[str], protected_fragments: list[str], protected_regex: list[re.Pattern[str]], manual_fragments: list[str]) -> tuple[str, str]:
    for frag in protected_paths:
        if frag in path or frag in text:
            return 'protected_legacy_source', f'legacy protected fragment: {frag}'

    for frag in protected_fragments:
        if frag in text:
            return 'protected_runtime_identifier', f'protected line fragment: {frag}'

    for pat in protected_regex:
        if pat.search(text):
            return 'protected_runtime_identifier', f'protected regex matched: {pat.pattern}'

    for frag in manual_fragments:
        if frag in text:
            return 'rewrite_with_manual_review', f'manual line fragment: {frag}'

    suffix = Path(path).suffix.lower()
    if suffix in MANUAL_EXTS:
        return 'rewrite_with_manual_review', f'manual review extension: {suffix}'

    return 'rewrite_safe', 'safe prose/doc rewrite'


def parse_line(raw: str) -> tuple[str, int, str]:
    path, rest = raw.split(':', 1)
    line_s, text = rest.split(':', 1)
    return path, int(line_s), text.strip()


def main() -> None:
    protected_paths, protected_fragments, protected_regex, manual_fragments = load_allowlist()

    rows = []
    for raw in INPUT.read_text(encoding='utf-8').splitlines():
        if not raw.strip():
            continue
        path, line_no, text = parse_line(raw)
        bucket, reason = classify(
            path,
            text,
            protected_paths,
            protected_fragments,
            protected_regex,
            manual_fragments,
        )
        rows.append({
            'path': path,
            'line': line_no,
            'bucket': bucket,
            'reason': reason,
            'text': text,
        })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['path', 'line', 'bucket', 'reason', 'text'])
        writer.writeheader()
        writer.writerows(rows)

    counts: dict[str, int] = {}
    for row in rows:
        counts[row['bucket']] = counts.get(row['bucket'], 0) + 1

    for key in sorted(counts):
        print(f'{key},{counts[key]}')


if __name__ == '__main__':
    main()
