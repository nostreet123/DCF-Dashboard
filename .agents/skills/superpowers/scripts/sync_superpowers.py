#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


MANAGED_DIRS = ("skills", "commands", "agents", "hooks")


@dataclass(frozen=True)
class SyncPaths:
    repo_root: Path
    superpowers_root: Path
    references_dir: Path
    version_file: Path


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_text(text: str) -> str:
    h = hashlib.sha256()
    h.update(text.encode("utf-8"))
    return h.hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def iter_files(root: Path) -> Iterable[Path]:
    if not root.exists():
        return []
    return sorted(p for p in root.rglob("*") if p.is_file())


def rel(path: Path, base: Path) -> str:
    return str(path.relative_to(base)).replace("\\", "/")


def normalized_skill_text(path: Path) -> str:
    skill_name = path.parent.name
    lines = path.read_text(encoding="utf-8").splitlines()
    in_frontmatter = False
    for i, line in enumerate(lines):
        if i == 0 and line.strip() == "---":
            in_frontmatter = True
            continue
        if in_frontmatter and line.strip() == "---":
            break
        if in_frontmatter and line.startswith("name:"):
            lines[i] = f"name: superpowers:{skill_name}"
            break
    return "\n".join(lines) + "\n"


def read_inventory(root: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    for subdir in MANAGED_DIRS:
        source_dir = root / subdir
        for file_path in iter_files(source_dir):
            key = f"{subdir}/{rel(file_path, source_dir)}"
            if key.startswith("skills/") and file_path.name == "SKILL.md":
                data[key] = sha256_text(normalized_skill_text(file_path))
            else:
                data[key] = sha256_file(file_path)
    return data


def ensure_dirs(paths: SyncPaths) -> None:
    paths.superpowers_root.mkdir(parents=True, exist_ok=True)
    paths.references_dir.mkdir(parents=True, exist_ok=True)


def rewrite_skill_frontmatter_names(skills_root: Path) -> None:
    for skill_file in iter_files(skills_root):
        if skill_file.name != "SKILL.md":
            continue
        skill_name = skill_file.parent.name
        lines = skill_file.read_text(encoding="utf-8").splitlines()
        in_frontmatter = False
        changed = False
        for i, line in enumerate(lines):
            if i == 0 and line.strip() == "---":
                in_frontmatter = True
                continue
            if in_frontmatter and line.strip() == "---":
                break
            if in_frontmatter and line.startswith("name:"):
                lines[i] = f"name: superpowers:{skill_name}"
                changed = True
                break
        if changed:
            skill_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def copy_managed_dirs(source_root: Path, target_root: Path) -> None:
    for subdir in MANAGED_DIRS:
        src = source_root / subdir
        dst = target_root / subdir
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
    rewrite_skill_frontmatter_names(target_root / "skills")


def write_version_file(paths: SyncPaths, source_root: Path, version: str) -> None:
    lines = [
        f"version={version}",
        f"source={source_root}",
        f"synced_at={utc_now_iso()}",
    ]
    paths.version_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_inventory(paths: SyncPaths, source_root: Path, version: str) -> None:
    out = paths.references_dir / f"upstream-inventory-{version}.md"
    rows: list[str] = []
    for subdir in MANAGED_DIRS:
        src_dir = source_root / subdir
        dst_dir = paths.superpowers_root / subdir
        for f in iter_files(src_dir):
            rows.append(
                f"| {subdir[:-1]} | `{rel(f, src_dir)}` | `{rel(f, source_root)}` | `{rel(dst_dir / rel(f, src_dir), paths.repo_root)}` |"
            )
    content = [
        f"# Superpowers Upstream Inventory ({version})",
        "",
        f"- Source: `{source_root}`",
        f"- Generated: `{utc_now_iso()}`",
        "",
        "| Type | Name | Source Path | Local Path |",
        "| --- | --- | --- | --- |",
        *rows,
        "",
    ]
    out.write_text("\n".join(content), encoding="utf-8")


def write_parity_matrix(paths: SyncPaths, source_root: Path, version: str) -> None:
    out = paths.references_dir / "parity-matrix.md"
    rows: list[str] = []
    for subdir in MANAGED_DIRS:
        src_dir = source_root / subdir
        dst_dir = paths.superpowers_root / subdir
        for f in iter_files(src_dir):
            dst = dst_dir / rel(f, src_dir)
            status = "ported" if dst.exists() else "missing"
            notes = (
                "namespaced skill name rewritten to superpowers:*"
                if subdir == "skills" and f.name == "SKILL.md"
                else "direct copy"
            )
            rows.append(
                f"| {subdir[:-1]} | `{rel(f, src_dir)}` | `{rel(dst, paths.repo_root)}` | {status} | {notes} |"
            )
    content = [
        "# Superpowers Parity Matrix",
        "",
        f"- Upstream Version: `{version}`",
        f"- Source: `{source_root}`",
        f"- Generated: `{utc_now_iso()}`",
        "",
        "| Type | Upstream Item | Local Path | Status | Notes |",
        "| --- | --- | --- | --- | --- |",
        *rows,
        "",
    ]
    out.write_text("\n".join(content), encoding="utf-8")


def write_alias_map(paths: SyncPaths) -> None:
    out = paths.references_dir / "alias-map.md"
    skills_root = paths.superpowers_root / "skills"
    rows = []
    for d in sorted(p for p in skills_root.iterdir() if p.is_dir()):
        plain = d.name
        namespaced = f"superpowers:{plain}"
        rows.append(f"| `{plain}` | `{namespaced}` |")
    content = [
        "# Superpowers Alias Map",
        "",
        "This map records plain skill-name aliases to namespaced forms.",
        "",
        "| Plain | Namespaced |",
        "| --- | --- |",
        *rows,
        "",
    ]
    out.write_text("\n".join(content), encoding="utf-8")


def compute_diff(source: dict[str, str], target: dict[str, str]) -> dict[str, list[str]]:
    source_keys = set(source)
    target_keys = set(target)
    missing = sorted(source_keys - target_keys)
    extra = sorted(target_keys - source_keys)
    changed = sorted(k for k in source_keys & target_keys if source[k] != target[k])
    return {"missing": missing, "extra": extra, "changed": changed}


def parse_key_value_file(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip()
    return data


def check_metadata(paths: SyncPaths, source_root: Path, version: str) -> dict[str, list[str]]:
    missing: list[str] = []
    mismatched: list[str] = []

    version_fields = parse_key_value_file(paths.version_file)
    if not version_fields:
        missing.append(rel(paths.version_file, paths.repo_root))
    else:
        if version_fields.get("version") != version:
            mismatched.append(
                f"{rel(paths.version_file, paths.repo_root)}: version={version_fields.get('version')} expected={version}"
            )
        if version_fields.get("source") != str(source_root):
            mismatched.append(
                f"{rel(paths.version_file, paths.repo_root)}: source={version_fields.get('source')} expected={source_root}"
            )

    expected_refs = [
        paths.references_dir / "parity-matrix.md",
        paths.references_dir / "alias-map.md",
        paths.references_dir / f"upstream-inventory-{version}.md",
    ]
    for p in expected_refs:
        if not p.exists():
            missing.append(rel(p, paths.repo_root))

    return {"missing": missing, "mismatched": mismatched}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Sync superpowers port from local Claude cache.")
    p.add_argument("--version", default="4.3.0", help="Upstream superpowers version.")
    p.add_argument(
        "--source-root",
        default=None,
        help="Optional explicit source root (defaults to Claude cache path for --version).",
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true", help="Check parity only, no writes.")
    g.add_argument("--apply", action="store_true", help="Apply sync from source.")
    return p.parse_args()


def build_paths() -> SyncPaths:
    repo_root = Path(__file__).resolve().parents[4]
    superpowers_root = repo_root / ".agents" / "skills" / "superpowers"
    return SyncPaths(
        repo_root=repo_root,
        superpowers_root=superpowers_root,
        references_dir=superpowers_root / "references",
        version_file=superpowers_root / "VERSION",
    )


def main() -> int:
    args = parse_args()
    paths = build_paths()
    ensure_dirs(paths)
    default_source = Path(
        f"/root/.claude/plugins/cache/claude-plugins-official/superpowers/{args.version}"
    )
    source_root = Path(args.source_root) if args.source_root else default_source
    if not source_root.exists():
        raise SystemExit(f"Source root not found: {source_root}")

    source_inv = read_inventory(source_root)
    target_inv = read_inventory(paths.superpowers_root)
    diff = compute_diff(source_inv, target_inv)

    metadata = check_metadata(paths, source_root, args.version)
    if args.check:
        payload = {"source": str(source_root), "version": args.version, **diff, "metadata": metadata}
        print(json.dumps(payload, indent=2))
        return 0 if (not any(diff.values()) and not any(metadata.values())) else 1

    copy_managed_dirs(source_root, paths.superpowers_root)
    write_version_file(paths, source_root, args.version)
    write_inventory(paths, source_root, args.version)
    write_parity_matrix(paths, source_root, args.version)
    write_alias_map(paths)

    # Recompute and report post-apply drift.
    after = compute_diff(source_inv, read_inventory(paths.superpowers_root))
    after_metadata = check_metadata(paths, source_root, args.version)
    print(
        json.dumps(
            {"source": str(source_root), "version": args.version, "post_apply": after, "metadata": after_metadata},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
