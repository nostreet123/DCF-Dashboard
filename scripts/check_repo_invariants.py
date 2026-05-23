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

LINE_COUNT_WARN = 800
LINE_COUNT_FAIL = 1000

# Temporary allowlist for known oversized files during unblock remediation.
# Remove entries as each phase lands below the limit.
LINE_COUNT_ALLOWLIST = {
    "test/aiScenarioRoute.test.ts",
    "convex/maintenance/duplicateScan.ts",
    # Fixed in downstream stacked PRs; allowlisted so guardrails can land first.
    "app/api/ai/scenario-analysis/route.ts",
    "lib/hooks/useDashboardController.ts",
    "python/damodaran_sync/sync.py",
}

# Routes still using route-local Convex escape hatches until PR 2 migrates them.
ROUTE_CONVEX_ANY_REMEDIATION_ALLOWLIST = {
    "app/api/ai/scenario-analysis/route.ts",
    "app/api/company/search/route.ts",
    "app/api/company/facts/route.ts",
    "app/api/company/import/context/route.ts",
    "app/api/company/import/parse/route.ts",
    "app/api/company/import/approve/route.ts",
    "app/api/dcf/run/route.ts",
    "app/api/dcf/history/route.ts",
    "app/api/dcf/history/browser/route.ts",
    "app/api/dcf/history/[runId]/route.ts",
    "app/api/dcf/history/browser/[runId]/route.ts",
}

GENERATED_PATH_PARTS = {
    "_generated",
    "node_modules",
    ".next",
    ".venv",
    ".bun-home",
    "__pycache__",
    "playwright-report",
    "test-results",
}

CONVEX_ANY_FACADE_FILES = {
    ROOT / "app" / "api" / "_lib" / "convexServer.ts",
    ROOT / "app" / "api" / "_lib" / "internalAuth.ts",
    ROOT / "app" / "api" / "_lib" / "rateLimit.ts",
}

ROUTE_CONVEX_ANY_PATTERN = re.compile(
    r"\(\s*convexClient\s+as\s+any\s*\)\.(query|mutation)\("
)


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


def is_generated_or_ignored(path: Path) -> bool:
    return any(part in GENERATED_PATH_PARTS for part in path.parts)


def count_source_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def check_line_counts(errors: list[str], warnings: list[str]) -> None:
    extensions = {".ts", ".tsx", ".py"}
    for base in (ROOT / "app", ROOT / "components", ROOT / "lib", ROOT / "convex", ROOT / "test", ROOT / "python"):
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in extensions or not path.is_file() or is_generated_or_ignored(path):
                continue
            rel_path = rel(path)
            line_count = count_source_lines(path)
            if line_count >= LINE_COUNT_FAIL:
                if rel_path in LINE_COUNT_ALLOWLIST:
                    warnings.append(
                        f"{rel_path}:{line_count} lines exceeds {LINE_COUNT_FAIL} "
                        f"(allowlisted during remediation)"
                    )
                else:
                    add_error(
                        errors,
                        path,
                        1,
                        f"file exceeds {LINE_COUNT_FAIL} lines ({line_count}); split before adding more code",
                    )
            elif line_count >= LINE_COUNT_WARN:
                warnings.append(
                    f"{rel_path}:{line_count} lines exceeds {LINE_COUNT_WARN} line warning threshold"
                )


def check_route_convex_any_hatches(errors: list[str], warnings: list[str]) -> None:
    route_root = ROOT / "app" / "api"
    if not route_root.exists():
        return
    for path in iter_files(route_root, ".ts"):
        if path in CONVEX_ANY_FACADE_FILES:
            continue
        rel_path = rel(path)
        text = path.read_text(encoding="utf-8")
        for match in ROUTE_CONVEX_ANY_PATTERN.finditer(text):
            if rel_path in ROUTE_CONVEX_ANY_REMEDIATION_ALLOWLIST:
                warnings.append(
                    f"{rel_path}:{line_for_offset(text, match.start())} "
                    f"route-local Convex escape hatch (allowlisted during remediation)"
                )
                continue
            add_error(
                errors,
                path,
                line_for_offset(text, match.start()),
                "route-local Convex (convexClient as any) call; use app/api/_lib/convexServer.ts",
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
    warnings: list[str] = []
    check_ds_store(errors)
    check_tracked_ds_store(errors)
    check_python_prints(errors)
    check_convex_mutation_auth(errors)
    check_convex_query_indexes(errors)
    check_line_counts(errors, warnings)
    check_route_convex_any_hatches(errors, warnings)

    if warnings:
        print("Repository invariant warnings:", file=sys.stderr)
        for warning in warnings:
            print(f"- {warning}", file=sys.stderr)

    if errors:
        print("Repository invariant check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Repository invariant check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
