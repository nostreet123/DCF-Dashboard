from __future__ import annotations

from collections import OrderedDict
from contextlib import contextmanager
from copy import deepcopy
import json
import os
import time
import threading
from pathlib import Path
from typing import Any, Callable, Iterator

CACHE_TTL_SECONDS = 24 * 60 * 60
_MAX_PARSED_TICKER_FILES = 8
_PARSED_TICKERS: OrderedDict[
    Path, tuple[tuple[int, int, int, int, int], list[dict[str, Any]]]
] = OrderedDict()
_PARSED_TICKERS_LOCK = threading.Lock()
# Only active readers/writers retain a path lock; unrelated paths can progress.
_TICKER_PATH_LOCKS: dict[Path, tuple[Any, int]] = {}


TickerFetcher = Callable[[str], dict[str, Any]]


def cache_dir() -> Path:
    raw = os.getenv("DCF_ENGINE_CACHE_DIR")
    if raw:
        return Path(raw)
    return Path.home() / ".cache" / "dcf_engine"


def ticker_cache_path(cache_key: str = "exchange") -> Path:
    safe_key = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in cache_key)
    return cache_dir() / f"company_tickers_{safe_key}.json"


def _parse_ticker_payload(payload: Any) -> list[dict[str, Any]] | None:
    if not isinstance(payload, dict):
        return None
    fields = payload.get("fields")
    data = payload.get("data")
    if isinstance(fields, list) and isinstance(data, list):
        parsed: list[dict[str, Any]] = []
        for row in data:
            if not isinstance(row, list):
                continue
            parsed.append(
                {
                    str(field): row[index] if index < len(row) else None
                    for index, field in enumerate(fields)
                }
            )
        return parsed
    return [entry for entry in payload.values() if isinstance(entry, dict)]


def _file_identity(stat: os.stat_result) -> tuple[int, int, int, int, int]:
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)


@contextmanager
def _ticker_path_lock(path: Path) -> Iterator[None]:
    with _PARSED_TICKERS_LOCK:
        existing = _TICKER_PATH_LOCKS.get(path)
        lock, users = existing if existing is not None else (threading.Lock(), 0)
        _TICKER_PATH_LOCKS[path] = (lock, users + 1)
    try:
        with lock:
            yield
    finally:
        with _PARSED_TICKERS_LOCK:
            _, users = _TICKER_PATH_LOCKS[path]
            if users == 1:
                del _TICKER_PATH_LOCKS[path]
            else:
                _TICKER_PATH_LOCKS[path] = (lock, users - 1)


def _copy_ticker_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # JSON scalars are immutable. Only nested containers need recursive copies.
    copied = []
    for row in rows:
        entry = row.copy()
        for key, value in row.items():
            if isinstance(value, (dict, list)):
                entry[key] = deepcopy(value)
        copied.append(entry)
    return copied


def _remember_tickers(
    path: Path, identity: tuple[int, int, int, int, int], parsed: list[dict[str, Any]],
) -> None:
    with _PARSED_TICKERS_LOCK:
        _PARSED_TICKERS.pop(path, None)
        _PARSED_TICKERS[path] = (identity, parsed)
        while len(_PARSED_TICKERS) > _MAX_PARSED_TICKER_FILES:
            _PARSED_TICKERS.popitem(last=False)


def load_cached_tickers(cache_key: str = "exchange") -> list[dict[str, Any]] | None:
    path = ticker_cache_path(cache_key).resolve()
    with _ticker_path_lock(path):
        try:
            stat = path.stat()
        except FileNotFoundError:
            with _PARSED_TICKERS_LOCK:
                _PARSED_TICKERS.pop(path, None)
            return None
        # TTL is checked even on memory hits; parsing reuse never extends it.
        if time.time() - stat.st_mtime > CACHE_TTL_SECONDS:
            with _PARSED_TICKERS_LOCK:
                _PARSED_TICKERS.pop(path, None)
            return None

        identity = _file_identity(stat)
        with _PARSED_TICKERS_LOCK:
            cached = _PARSED_TICKERS.pop(path, None)
            if cached is not None and cached[0] == identity:
                _PARSED_TICKERS[path] = cached
        if cached is not None and cached[0] == identity:
            parsed = cached[1]
        else:
            try:
                with path.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                    # Do not retain a snapshot that changed while it was read.
                    if _file_identity(os.fstat(handle.fileno())) != identity:
                        return None
                if _file_identity(path.stat()) != identity:
                    return None
            except (FileNotFoundError, json.JSONDecodeError):
                return None

            parsed = _parse_ticker_payload(payload)
            if parsed is None:
                return None
            _remember_tickers(path, identity, parsed)
    # Retained snapshots are never handed to callers or mutated. Copying can
    # happen after releasing both the shared state and per-path locks.
    return _copy_ticker_rows(parsed)


def _write_ticker_cache(
    cache_key: str, serialized: str, parsed: list[dict[str, Any]] | None = None,
) -> None:
    path = ticker_cache_path(cache_key).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _ticker_path_lock(path):
        with _PARSED_TICKERS_LOCK:
            _PARSED_TICKERS.pop(path, None)
        with path.open("w+", encoding="utf-8") as handle:
            handle.write(serialized)
            handle.flush()
            identity = _file_identity(os.fstat(handle.fileno()))
            if parsed is not None:
                # Verify the bytes and identity together before retaining the
                # snapshot: another process may write this file concurrently.
                handle.seek(0)
                if (handle.read() != serialized
                        or _file_identity(os.fstat(handle.fileno())) != identity):
                    parsed = None
        # parsed came from these serialized bytes, not mutable fetcher data.
        # A replacement or in-place edit after writing must not seed old rows
        # under the new file's identity.
        if parsed is not None:
            try:
                if _file_identity(path.stat()) == identity:
                    _remember_tickers(path, identity, parsed)
            except FileNotFoundError:
                pass


def write_ticker_cache(cache_key: str, payload: dict[str, Any]) -> None:
    _write_ticker_cache(cache_key, json.dumps(payload))


def load_company_tickers(
    fetch_json: TickerFetcher,
    tickers_url: str,
    *,
    cache_key: str = "exchange",
) -> list[dict[str, Any]]:
    cached = load_cached_tickers(cache_key)
    if cached is not None:
        return cached

    payload = fetch_json(tickers_url)
    serialized = json.dumps(payload)
    parsed = _parse_ticker_payload(json.loads(serialized))
    if parsed is None:
        raise RuntimeError("Unexpected response from SEC company tickers endpoint")

    _write_ticker_cache(cache_key, serialized, parsed)
    return _copy_ticker_rows(parsed)
