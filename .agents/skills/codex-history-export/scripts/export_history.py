#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_IN_PATH = str(Path.home() / ".codex" / "history.jsonl")


@dataclass(frozen=True)
class Entry:
    session_id: str
    ts: int
    text: str


def iso_utc(ts_seconds: int) -> str:
    return (
        datetime.fromtimestamp(ts_seconds, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def read_entries(path: Path) -> list[Entry]:
    entries: list[Entry] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            session_id = str(obj.get("session_id", "")).strip()
            ts = int(obj.get("ts", 0) or 0)
            text = (
                str(obj.get("text", ""))
                .replace("\t", " ")
                .replace("\r", " ")
                .replace("\n", " ")
                .strip()
            )
            if not session_id or not text or ts <= 0:
                continue
            entries.append(Entry(session_id=session_id, ts=ts, text=text))
    entries.sort(key=lambda e: e.ts)
    return entries


def redact_text(text: str) -> str:
    # Redact common secrets that appear in history logs. Keep this conservative and opt-out via --no-redact.
    patterns: list[tuple[re.Pattern[str], str]] = [
        # Common env var assignments.
        (
            re.compile(r"(\b[A-Z0-9_]*(?:TOKEN|API_KEY|KEY)\b\s*[:=]\s*)([^\s\"}]+)"),
            r"\1<REDACTED>",
        ),
        # JSON-ish syncToken.
        (re.compile(r'("syncToken"\s*:\s*")([^"]+)(")'), r'\1<REDACTED>\3'),
        # Convex deploy key format: dev:<name>|<opaque>
        (re.compile(r"(\bdev:[^\s|]+[|])([^\s]+)"), r"\1<REDACTED>"),
        # OAuth callback/query params.
        (
            re.compile(r"([?&](?:state|code|access_token|refresh_token|token)=)([^&\s]+)"),
            r"\1<REDACTED>",
        ),
    ]
    redacted = text
    for pat, repl in patterns:
        redacted = pat.sub(repl, redacted)
    return redacted


def maybe_truncate(text: str, max_len: int | None) -> str:
    if max_len is None or max_len <= 0:
        return text
    if len(text) <= max_len:
        return text
    ellipsis = "..."
    if max_len <= len(ellipsis):
        return ellipsis[:max_len]
    return text[: max_len - len(ellipsis)] + ellipsis


def filter_entries(entries: Iterable[Entry], session_id: str | None) -> list[Entry]:
    if session_id is None:
        return list(entries)
    return [e for e in entries if e.session_id == session_id]


def dedupe_entries(entries: list[Entry]) -> list[Entry]:
    # Remove exact duplicates and collapse consecutive identical messages within the same session.
    out: list[Entry] = []
    seen: set[tuple[str, int, str]] = set()
    last_by_session: dict[str, str] = {}
    for e in entries:
        key = (e.session_id, e.ts, e.text)
        if key in seen:
            continue
        prev = last_by_session.get(e.session_id)
        if prev is not None and prev == e.text:
            continue
        seen.add(key)
        last_by_session[e.session_id] = e.text
        out.append(e)
    return out


def write_full(entries: list[Entry], out_path: Path, redact: bool, max_text_len: int | None) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        f.write("utc_timestamp\tsession_id\ttext\n")
        for e in entries:
            text = redact_text(e.text) if redact else e.text
            text = maybe_truncate(text, max_text_len)
            f.write(f"{iso_utc(e.ts)}\t{e.session_id}\t{text}\n")


def write_grouped(
    entries: list[Entry],
    out_path: Path,
    redact: bool,
    max_text_len: int | None,
    source_path: Path,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    grouped: dict[str, list[Entry]] = defaultdict(list)
    for e in entries:
        grouped[e.session_id].append(e)

    # Keep session order by first timestamp (entries are already sorted).
    session_order = sorted(grouped.keys(), key=lambda sid: grouped[sid][0].ts)

    with out_path.open("w", encoding="utf-8") as f:
        f.write(f"source: {source_path}\n")
        f.write(f"entries: {len(entries)}\n")
        f.write(f"sessions: {len(session_order)}\n\n")
        for idx, sid in enumerate(session_order, start=1):
            sess = grouped[sid]
            f.write(f"=== Session {idx} ===\n")
            f.write(f"session_id: {sid}\n")
            f.write(f"start_utc: {iso_utc(sess[0].ts)}\n")
            f.write(f"end_utc: {iso_utc(sess[-1].ts)}\n")
            f.write(f"messages: {len(sess)}\n")
            f.write("---\n")
            for e in sess:
                text = redact_text(e.text) if redact else e.text
                text = maybe_truncate(text, max_text_len)
                f.write(f"{iso_utc(e.ts)}\t{text}\n")
            f.write("\n")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export Codex CLI history.jsonl to readable text formats.")
    p.add_argument("--in", dest="in_path", default=os.environ.get("CODEX_HISTORY_PATH", DEFAULT_IN_PATH))
    p.add_argument("--out", dest="out_path", required=False)
    p.add_argument("--mode", choices=["full", "grouped", "dedupe"], default="full")
    p.add_argument("--session", dest="session_id", default=None, help="Filter to a single session_id.")
    p.add_argument("--max-text-len", dest="max_text_len", type=int, default=0)
    p.add_argument("--no-redact", dest="redact", action="store_false", help="Disable redaction.")
    p.set_defaults(redact=True)
    return p.parse_args()


def default_out_path(mode: str) -> Path:
    return Path("/tmp") / f"codex_history_{mode}.txt"


def main() -> int:
    args = parse_args()
    in_path = Path(args.in_path)
    if not in_path.exists():
        raise SystemExit(f"history file not found: {in_path}")

    entries = read_entries(in_path)
    entries = filter_entries(entries, args.session_id)
    if args.mode == "dedupe":
        entries = dedupe_entries(entries)

    out_path = Path(args.out_path) if args.out_path else default_out_path(args.mode)
    max_len = int(args.max_text_len) if int(args.max_text_len) > 0 else None

    if args.mode in {"full", "dedupe"}:
        write_full(entries, out_path, redact=bool(args.redact), max_text_len=max_len)
    elif args.mode == "grouped":
        write_grouped(entries, out_path, redact=bool(args.redact), max_text_len=max_len, source_path=in_path)
    else:
        raise SystemExit(f"unknown mode: {args.mode}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
