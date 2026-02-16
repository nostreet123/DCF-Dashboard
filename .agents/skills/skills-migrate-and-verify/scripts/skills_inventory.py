#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RootInfo:
    label: str
    path: Path


def repo_root_from_here() -> Path:
    # <repo>/.agents/skills/skills-migrate-and-verify/scripts/skills_inventory.py
    return Path(__file__).resolve().parents[4]


def skill_names(root: Path) -> list[str]:
    names: list[str] = []
    if not root.exists() or not root.is_dir():
        return names
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith("."):
            continue
        if (child / "SKILL.md").exists():
            names.append(child.name)
    return names


def resolved_path(p: Path) -> Path:
    try:
        return p.resolve(strict=False)
    except OSError:
        return p


def describe_path(p: Path) -> str:
    if not p.exists() and not p.is_symlink():
        return "missing"
    if p.is_symlink():
        try:
            target = resolved_path(p)
            return f"symlink -> {target}"
        except OSError:
            return "symlink (unresolved)"
    if p.is_dir():
        return "dir"
    return "file"


def default_roots() -> list[RootInfo]:
    repo_root = repo_root_from_here()
    home = Path(os.path.expanduser("~"))

    candidates: list[RootInfo] = [
        RootInfo("repo:.agents/skills", repo_root / ".agents" / "skills"),
        RootInfo("repo:.codex/skills", repo_root / ".codex" / "skills"),
        RootInfo("home:.agents/skills", home / ".agents" / "skills"),
        RootInfo("home:.agent/skills", home / ".agent" / "skills"),
        RootInfo("home:.codex/skills", home / ".codex" / "skills"),
        RootInfo("/root/.codex/skills", Path("/root/.codex/skills")),
    ]
    seen: set[Path] = set()
    uniq: list[RootInfo] = []
    for c in candidates:
        if c.path in seen:
            continue
        seen.add(c.path)
        uniq.append(c)
    return uniq


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Inventory skill roots and symlinks across CLIs.")
    p.add_argument("--list-skills", action="store_true", help="List skill names found under each root.")
    p.add_argument("--max-list", type=int, default=40, help="Max skill names to print per root.")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    roots = default_roots()

    repo_root = repo_root_from_here()
    canonical = repo_root / ".agents" / "skills"
    canonical_resolved = resolved_path(canonical)

    print("Skill roots inventory")
    print()
    inspected: list[tuple[RootInfo, str, list[str], Path]] = []
    for r in roots:
        status = describe_path(r.path)
        names = skill_names(r.path)
        resolved = resolved_path(r.path) if (r.path.exists() or r.path.is_symlink()) else r.path
        inspected.append((r, status, names, resolved))
        print(f"- {r.label}: {r.path} ({status})")
        if args.list_skills and names:
            shown = names[: max(0, int(args.max_list))]
            suffix = "" if len(names) <= len(shown) else f" (+{len(names) - len(shown)} more)"
            print(f"  skills: {', '.join(shown)}{suffix}")

    if canonical.exists() and canonical.is_dir():
        print()
        print("Canonical root")
        print(f"- {canonical} ({canonical_resolved})")

        non_canonical_links: list[str] = []
        for r, status, _names, resolved in inspected:
            if "missing" in status:
                continue
            if resolved == canonical_resolved:
                continue
            non_canonical_links.append(f"- {r.label}: {r.path} ({status})")

        if non_canonical_links:
            print()
            print("Roots not pointing at canonical")
            for line in non_canonical_links:
                print(line)

        # Detect duplicate skill names across distinct resolved roots (ignore symlink aliases to the same directory).
        root_to_skills: dict[Path, set[str]] = {}
        root_to_labels: dict[Path, list[str]] = {}
        for r, status, names, resolved in inspected:
            if "missing" in status:
                continue
            if not names:
                continue
            root_to_skills.setdefault(resolved, set()).update(names)
            root_to_labels.setdefault(resolved, []).append(r.label)

        skill_to_roots: dict[str, set[Path]] = {}
        for root_path, skills in root_to_skills.items():
            for s in skills:
                skill_to_roots.setdefault(s, set()).add(root_path)

        duplicates = {s: roots for (s, roots) in skill_to_roots.items() if len(roots) > 1}
        if duplicates:
            print()
            print("Duplicate skill names across distinct roots")
            for s in sorted(duplicates.keys()):
                labels: list[str] = []
                for rp in sorted(duplicates[s], key=lambda p: str(p)):
                    labels.append(f"{rp} ({', '.join(sorted(set(root_to_labels.get(rp, []))))})")
                print(f"- {s}: " + "; ".join(labels))

        # Report skills present outside canonical but missing from canonical (migration candidates).
        canonical_skills = root_to_skills.get(canonical_resolved, set())
        missing_from_canonical: list[str] = []
        for root_path, skills in root_to_skills.items():
            if root_path == canonical_resolved:
                continue
            diff = sorted(skills - canonical_skills)
            if not diff:
                continue
            labels = ", ".join(sorted(set(root_to_labels.get(root_path, []))))
            missing_from_canonical.append(f"- {root_path} ({labels}): {', '.join(diff[:10])}" + ("" if len(diff) <= 10 else f" (+{len(diff) - 10} more)"))

        if missing_from_canonical:
            print()
            print("Skills present outside canonical (consider migrating into repo:.agents/skills)")
            for line in missing_from_canonical:
                print(line)

        print()
        print("Suggested symlinks (review before running)")
        home = Path(os.path.expanduser("~"))
        suggestions = [
            (home / ".codex" / "skills", canonical),
            (home / ".agents" / "skills", canonical),
            (home / ".agent" / "skills", canonical),
        ]
        for dst, src in suggestions:
            print(f"- if [ -d \"{dst}\" ] && [ ! -L \"{dst}\" ]; then mv \"{dst}\" \"{dst}.bak.$(date +%s)\"; fi")
            print(f"  mkdir -p \"{dst.parent}\"")
            print(f"  ln -sfn \"{src}\" \"{dst}\"")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
