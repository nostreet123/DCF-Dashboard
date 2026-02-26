#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

CLASSIFIED = Path('.agent/tmp/claude_mentions.classified.csv')
REPORT = Path('.agent/tmp/claude_mentions.rewrite_report.json')
ALLOWLIST = Path('.agent/scripts/claude_rewrite_allowlist.json')

REPLACEMENTS = [
    (re.compile(r'\bClaude Code\b'), 'Codex CLI'),
    (re.compile(r'\bClaude plugin\b'), 'Codex skill'),
    (re.compile(r'\bCLAUDE\.md\b'), 'AGENTS.md'),
    (re.compile(r'\bClaude\b'), 'Codex'),
    (re.compile(r'\bCLAUDE\b'), 'CODEX'),
    (re.compile(r'\bclaude\b'), 'codex'),
]


def load_allowlist() -> tuple[list[str], list[str], list[re.Pattern[str]]]:
    data = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
    protected_paths = list(data.get('protected_path_fragments', []))
    protected_fragments = list(data.get('protected_line_fragments', []))
    protected_regex = [re.compile(p) for p in data.get('protected_line_regex', [])]
    return protected_paths, protected_fragments, protected_regex


def should_skip_line(path: str, line: str, protected_paths: list[str], protected_fragments: list[str], protected_regex: list[re.Pattern[str]]) -> bool:
    for frag in protected_paths:
        if frag in path or frag in line:
            return True
    for frag in protected_fragments:
        if frag in line:
            return True
    for pat in protected_regex:
        if pat.search(line):
            return True
    # avoid rewriting URL host/path fragments blindly when URL itself contains "claude"
    for match in re.finditer(r'https?://\S+', line):
        if 'claude' in match.group(0).lower():
            return True
    return False


def rewrite_line(path: str, line: str, protected_paths: list[str], protected_fragments: list[str], protected_regex: list[re.Pattern[str]]) -> tuple[str, int]:
    if should_skip_line(path, line, protected_paths, protected_fragments, protected_regex):
        return line, 0
    out = line
    changes = 0
    for pat, repl in REPLACEMENTS:
        out2, count = pat.subn(repl, out)
        if count:
            out = out2
            changes += count
    return out, changes


def load_targets(include_manual: bool) -> tuple[dict[str, set[int]], dict[str, str]]:
    targets: dict[str, set[int]] = defaultdict(set)
    line_buckets: dict[str, str] = {}
    with CLASSIFIED.open(newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            bucket = row['bucket']
            if bucket == 'rewrite_safe' or (include_manual and bucket == 'rewrite_with_manual_review'):
                path = row['path']
                line = int(row['line'])
                targets[path].add(line)
                line_buckets[f'{path}:{line}'] = bucket
    return targets, line_buckets


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--include-manual-review', action='store_true')
    args = parser.parse_args()

    dry_run = args.dry_run or not args.apply
    protected_paths, protected_fragments, protected_regex = load_allowlist()
    targets, line_buckets = load_targets(include_manual=args.include_manual_review)

    changed_files = []
    total_line_edits = 0
    total_replacements = 0
    file_reports = []
    touched_by_bucket: dict[str, int] = defaultdict(int)

    for path_str, line_numbers in sorted(targets.items()):
        path = Path(path_str)
        if not path.exists():
            continue
        lines = path.read_text(encoding='utf-8').splitlines(keepends=True)
        file_changed = False
        file_line_edits = 0
        file_replacements = 0

        for ln in sorted(line_numbers):
            idx = ln - 1
            if idx < 0 or idx >= len(lines):
                continue
            original = lines[idx]
            rewritten, count = rewrite_line(
                path_str,
                original,
                protected_paths,
                protected_fragments,
                protected_regex,
            )
            if rewritten != original:
                lines[idx] = rewritten
                file_changed = True
                file_line_edits += 1
                file_replacements += count
                touched_by_bucket[line_buckets.get(f'{path_str}:{ln}', 'unknown')] += 1

        if file_changed:
            changed_files.append(path_str)
            total_line_edits += file_line_edits
            total_replacements += file_replacements
            if not dry_run:
                path.write_text(''.join(lines), encoding='utf-8')

        file_reports.append({
            'path': path_str,
            'candidate_lines': len(line_numbers),
            'changed_lines': file_line_edits,
            'replacements': file_replacements,
            'changed': file_changed,
        })

    report = {
        'mode': 'dry-run' if dry_run else 'apply',
        'include_manual_review': args.include_manual_review,
        'files_considered': len(targets),
        'files_changed': len(changed_files),
        'line_edits': total_line_edits,
        'replacements': total_replacements,
        'touched_by_bucket': dict(sorted(touched_by_bucket.items())),
        'changed_files': changed_files,
        'file_reports': file_reports,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding='utf-8')

    print(json.dumps({
        'mode': report['mode'],
        'files_considered': report['files_considered'],
        'files_changed': report['files_changed'],
        'line_edits': report['line_edits'],
        'replacements': report['replacements'],
        'touched_by_bucket': report['touched_by_bucket'],
    }))


if __name__ == '__main__':
    main()
