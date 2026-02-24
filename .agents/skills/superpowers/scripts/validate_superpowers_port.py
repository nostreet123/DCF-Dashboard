#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


EXPECTED_SKILLS = {
    "brainstorming",
    "dispatching-parallel-agents",
    "executing-plans",
    "finishing-a-development-branch",
    "receiving-code-review",
    "requesting-code-review",
    "subagent-driven-development",
    "systematic-debugging",
    "test-driven-development",
    "using-git-worktrees",
    "using-superpowers",
    "verification-before-completion",
    "writing-plans",
    "writing-skills",
}


def main() -> int:
    repo_root = Path(__file__).resolve().parents[4]
    root = repo_root / ".agents" / "skills" / "superpowers"
    skills_root = root / "skills"

    found = {p.name for p in skills_root.iterdir() if p.is_dir()}
    missing = sorted(EXPECTED_SKILLS - found)
    extra = sorted(found - EXPECTED_SKILLS)

    namespaced_ok = True
    for skill in sorted(EXPECTED_SKILLS & found):
        skill_md = skills_root / skill / "SKILL.md"
        text = skill_md.read_text(encoding="utf-8")
        expected = f"name: superpowers:{skill}"
        if expected not in text:
            namespaced_ok = False
            print(f"ERROR: {skill_md} missing `{expected}`")

    if missing:
        print(f"ERROR: missing skills: {missing}")
    if extra:
        print(f"ERROR: extra skills: {extra}")

    if missing or extra or not namespaced_ok:
        return 1

    required_files = [
        root / "commands" / "brainstorm.md",
        root / "commands" / "execute-plan.md",
        root / "commands" / "write-plan.md",
        root / "agents" / "code-reviewer.md",
        root / "hooks" / "hooks.json",
        root / "scripts" / "sync_superpowers.py",
        root / "references" / "parity-matrix.md",
        root / "references" / "upstream-inventory-4.3.0.md",
        root / "references" / "alias-map.md",
        root / "references" / "trigger-scenarios.md",
        root / "VERSION",
    ]
    missing_files = [str(p) for p in required_files if not p.exists()]
    if missing_files:
        print(f"ERROR: required files missing: {missing_files}")
        return 1

    version_file = root / "VERSION"
    pinned_version = "4.3.0"
    if version_file.exists():
        for line in version_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("version="):
                pinned_version = line.split("=", 1)[1].strip()
                break

    sync_cmd = [
        sys.executable,
        str(root / "scripts" / "sync_superpowers.py"),
        "--version",
        pinned_version,
        "--check",
    ]
    sync = subprocess.run(sync_cmd, cwd=repo_root, capture_output=True, text=True)
    if sync.returncode != 0:
        print("ERROR: sync parity check failed.")
        if sync.stdout:
            print(sync.stdout.strip())
        if sync.stderr:
            print(sync.stderr.strip())
        return 1

    print("OK: superpowers port structure, namespacing, parity, and metadata validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
