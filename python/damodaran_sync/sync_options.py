from __future__ import annotations

import os
from dataclasses import dataclass


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


MAX_SNAPSHOT_IDENTITY_BATCH = 100
MAX_ASSET_BATCH = 500


@dataclass(frozen=True)
class SyncRunOptions:
    force_rebuild: bool = False
    additive_only: bool = False
    head_precheck: bool | None = None

    @property
    def effective_force_rebuild(self) -> bool:
        return self.force_rebuild and not self.additive_only

    @property
    def profile_enabled(self) -> bool:
        return env_bool("DAMODARAN_SYNC_PROFILE", False)

    @property
    def limit_assets(self) -> int | None:
        limit_raw = os.getenv("DAMODARAN_SYNC_LIMIT", "").strip()
        if limit_raw.isdigit() and int(limit_raw) > 0:
            return int(limit_raw)
        return None

    @property
    def trust_archive_immutable(self) -> bool:
        return env_bool("DAMODARAN_TRUST_ARCHIVE_IMMUTABLE", False)

    @property
    def conditional_get_enabled(self) -> bool:
        return env_bool("DAMODARAN_CONDITIONAL_GET", True)

    @property
    def head_precheck_enabled(self) -> bool:
        if self.head_precheck is not None:
            return self.head_precheck
        return env_bool("DAMODARAN_HEAD_PRECHECK", False)

    @property
    def fast_exit_if_manifest_unchanged(self) -> bool:
        return env_bool("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", False)

    @property
    def sync_workers(self) -> int:
        requested = env_int("DAMODARAN_SYNC_WORKERS", 1)
        return max(1, requested)

    @property
    def snapshot_batch_size(self) -> int:
        requested = env_int("DAMODARAN_SNAPSHOT_BATCH_SIZE", MAX_SNAPSHOT_IDENTITY_BATCH)
        return max(1, min(MAX_SNAPSHOT_IDENTITY_BATCH, requested))

    @property
    def asset_batch_size(self) -> int:
        requested = env_int("DAMODARAN_ASSET_BATCH_SIZE", MAX_ASSET_BATCH)
        return max(1, min(MAX_ASSET_BATCH, requested))


def get_insert_batch_limits() -> tuple[int, int]:
    max_rows = env_int("DAMODARAN_INSERT_BATCH_MAX_ROWS", 100)
    max_rows = max(1, min(900, max_rows))

    default_bytes = 8 * 1024 * 1024
    max_bytes = env_int("DAMODARAN_INSERT_BATCH_MAX_BYTES", default_bytes)
    max_bytes = max(1024, min(16 * 1024 * 1024, max_bytes))
    return max_rows, max_bytes
