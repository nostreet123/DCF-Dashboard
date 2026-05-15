#!/usr/bin/env python3
from __future__ import annotations

import ast
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

PYTHON_LIBRARY_DIRS = (
    ROOT / "python" / "dcf_engine",
    ROOT / "python" / "damodaran_sync",
)
PYTHON_PRINT_ALLOWLIST = {
    ROOT / "python" / "dcf_engine" / "cli.py",
    ROOT / "python" / "damodaran_sync" / "cli.py",
}

CONVEX_MUTATION_ALLOWLIST = {
    # Internal mutations are callable only from Convex functions, not public clients.
    "Internal",
}

QUERY_WITH_INDEX_ALLOWLIST = {
    # Search indexes are purpose-built query indexes and are acceptable here.
    "withSearchIndex",
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def iter_files(base: Path, suffix: str) -> list[Path]:
    if not base.exists():
        return []
    ignored_parts = {"node_modules", ".next", ".venv", ".bun-home", "__pycache__"}
    return [
        path
        for path in base.rglob(f"*{suffix}")
        if not any(part in ignored_parts for part in path.parts)
    ]


def add_error(errors: list[str], path: Path, line: int, message: str) -> None:
    errors.append(f"{rel(path)}:{line}: {message}")


def check_ds_store(errors: list[str]) -> None:
    gitignore = ROOT / ".gitignore"
    ignored = gitignore.read_text(encoding="utf-8").splitlines()
    if ".DS_Store" not in ignored:
        add_error(errors, gitignore, 1, "add .DS_Store to .gitignore")

    for path in ROOT.rglob(".DS_Store"):
        if any(
            part in {".git", ".worktrees", "node_modules", ".next", ".venv", ".bun-home"}
            for part in path.parts
        ):
            continue
        add_error(errors, path, 1, "remove Finder metadata from the workspace")


def check_python_prints(errors: list[str]) -> None:
    for base in PYTHON_LIBRARY_DIRS:
        for path in iter_files(base, ".py"):
            if path in PYTHON_PRINT_ALLOWLIST or "tests" in path.parts:
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except SyntaxError as exc:
                add_error(errors, path, exc.lineno or 1, f"Python syntax error: {exc.msg}")
                continue

            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name)
                    and node.func.id == "print"
                ):
                    add_error(errors, path, node.lineno, "use logging instead of bare print() in library code")


def find_matching_brace(text: str, open_index: int) -> int:
    depth = 0
    in_string: str | None = None
    escaped = False
    in_line_comment = False
    in_block_comment = False

    for index in range(open_index, len(text)):
        char = text[index]
        next_char = text[index + 1] if index + 1 < len(text) else ""

        if in_line_comment:
            if char == "\n":
                in_line_comment = False
            continue
        if in_block_comment:
            if char == "*" and next_char == "/":
                in_block_comment = False
            continue
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue

        if char == "/" and next_char == "/":
            in_line_comment = True
            continue
        if char == "/" and next_char == "*":
            in_block_comment = True
            continue
        if char in {"'", '"', "`"}:
            in_string = char
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index

    return len(text)


def line_for_offset(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def check_convex_mutation_auth(errors: list[str]) -> None:
    pattern = re.compile(r"export\s+const\s+(\w+)\s*=\s*(internalMutation|mutation)\s*\(\s*{")

    for path in iter_files(ROOT / "convex", ".ts"):
        text = path.read_text(encoding="utf-8")
        for match in pattern.finditer(text):
            name, kind = match.group(1), match.group(2)
            if kind == "internalMutation" or any(name.endswith(suffix) for suffix in CONVEX_MUTATION_ALLOWLIST):
                continue

            block_start = text.find("{", match.end() - 1)
            block_end = find_matching_brace(text, block_start)
            block = text[block_start:block_end]

            if "syncToken" not in block or "requireSyncToken(args.syncToken)" not in block:
                add_error(
                    errors,
                    path,
                    line_for_offset(text, match.start()),
                    f"mutation {name} must accept syncToken and call requireSyncToken(args.syncToken)",
                )


def check_convex_query_indexes(errors: list[str]) -> None:
    query_pattern = re.compile(r"\.query\(\s*[\"']([^\"']+)[\"']\s*\)")

    for path in iter_files(ROOT / "convex", ".ts"):
        text = path.read_text(encoding="utf-8")
        for match in query_pattern.finditer(text):
            window = text[match.end() : match.end() + 260]
            if ".withIndex(" in window or any(token in window for token in QUERY_WITH_INDEX_ALLOWLIST):
                continue
            add_error(
                errors,
                path,
                line_for_offset(text, match.start()),
                "Convex table queries must use withIndex() or an explicit search index",
            )


def check_tracked_ds_store(errors: list[str]) -> None:
    if not (ROOT / ".git").exists():
        return

    result = subprocess.run(
        ["git", "ls-files", "**/.DS_Store", ".DS_Store"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        errors.append(f"git ls-files failed: {result.stderr.strip()}")
        return
    for line in result.stdout.splitlines():
        add_error(errors, ROOT / line, 1, "remove tracked .DS_Store")


def main() -> int:
    errors: list[str] = []
    check_ds_store(errors)
    check_tracked_ds_store(errors)
    check_python_prints(errors)
    check_convex_mutation_auth(errors)
    check_convex_query_indexes(errors)

    if errors:
        print("Repository invariant check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Repository invariant check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
