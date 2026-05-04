from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable

CACHE_TTL_SECONDS = 24 * 60 * 60


TickerFetcher = Callable[[str], dict[str, Any]]


def cache_dir() -> Path:
    raw = os.getenv("DCF_ENGINE_CACHE_DIR")
    if raw:
        return Path(raw)
    return Path.home() / ".cache" / "dcf_engine"


def ticker_cache_path() -> Path:
    return cache_dir() / "company_tickers_exchange.json"


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


def load_cached_tickers() -> list[dict[str, Any]] | None:
    path = ticker_cache_path()
    if not path.exists():
        return None

    age_seconds = time.time() - path.stat().st_mtime
    if age_seconds > CACHE_TTL_SECONDS:
        return None

    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except json.JSONDecodeError:
        return None

    return _parse_ticker_payload(payload)


def write_ticker_cache(payload: dict[str, Any]) -> None:
    path = ticker_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle)


def load_company_tickers(fetch_json: TickerFetcher, tickers_url: str) -> list[dict[str, Any]]:
    cached = load_cached_tickers()
    if cached is not None:
        return cached

    payload = fetch_json(tickers_url)
    parsed = _parse_ticker_payload(payload)
    if parsed is None:
        raise RuntimeError("Unexpected response from SEC company tickers endpoint")

    write_ticker_cache(payload)
    return parsed
