from __future__ import annotations

from pathlib import Path
import os

DEFAULT_CACHE_DIR = Path(".cache") / "damodaran"
DEFAULT_RATE_LIMIT_SECONDS = 1.0
DEFAULT_REQUEST_TIMEOUT = 30


def get_rate_limit_seconds() -> float:
    override = os.getenv("DAMODARAN_RATE_LIMIT_SECONDS")
    if override is None:
        return DEFAULT_RATE_LIMIT_SECONDS
    try:
        value = float(override)
    except ValueError:
        return DEFAULT_RATE_LIMIT_SECONDS
    return max(0.0, value)


def get_cache_dir() -> Path:
    override = os.getenv("DAMODARAN_CACHE_DIR")
    if override:
        return Path(override)
    return DEFAULT_CACHE_DIR


def get_raw_cache_dir() -> Path:
    return get_cache_dir() / "raw"
