from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
import json
import os
import time
import threading
from pathlib import Path
from typing import Any, Callable

CACHE_TTL_SECONDS = 24 * 60 * 60
_MAX_PARSED_TICKER_FILES = 8
_PARSED_TICKERS: OrderedDict[
    Path, tuple[tuple[int, int, int, int, int], list[dict[str, Any]]]
] = OrderedDict()
_PARSED_TICKERS_LOCK = threading.Lock()


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


def load_cached_tickers(cache_key: str = "exchange") -> list[dict[str, Any]] | None:
    path = ticker_cache_path(cache_key).resolve()
    with _PARSED_TICKERS_LOCK:
        try:
            stat = path.stat()
        except FileNotFoundError:
            _PARSED_TICKERS.pop(path, None)
            return None
        # TTL is checked even on memory hits; parsing reuse never extends it.
        if time.time() - stat.st_mtime > CACHE_TTL_SECONDS:
            _PARSED_TICKERS.pop(path, None)
            return None

        identity = _file_identity(stat)
        cached = _PARSED_TICKERS.pop(path, None)
        if cached is not None and cached[0] == identity:
            _PARSED_TICKERS[path] = cached
            return deepcopy(cached[1])

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
        _PARSED_TICKERS[path] = (identity, parsed)
        while len(_PARSED_TICKERS) > _MAX_PARSED_TICKER_FILES:
            _PARSED_TICKERS.popitem(last=False)
        # Callers historically owned their freshly parsed values, including
        # nested JSON values and duplicate-symbol order.
        return deepcopy(parsed)


def write_ticker_cache(cache_key: str, payload: dict[str, Any]) -> None:
    path = ticker_cache_path(cache_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle)


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
    parsed = _parse_ticker_payload(payload)
    if parsed is None:
        raise RuntimeError("Unexpected response from SEC company tickers endpoint")

    write_ticker_cache(cache_key, payload)
    return parsed
