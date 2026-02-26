from __future__ import annotations

import logging
import os
import time

from fastapi import FastAPI, HTTPException, Query, Request
import requests

from dcf_engine.service.sec_edgar import fetch_company_facts, search_companies
from dcf_engine.workbench.run import run_workbench
from dcf_engine.workbench.schema import WorkbenchRequest, WorkbenchResponse

logger = logging.getLogger(__name__)

app = FastAPI(title="DCF Engine Service", version="0.1.0")

SEC_SEARCH_FAILURE_DETAIL = "SEC search failed"
SEC_FACTS_NOT_FOUND_DETAIL = "Unknown ticker"
SEC_FACTS_FAILURE_DETAIL = "SEC facts fetch failed"
DCF_COMPUTE_BAD_REQUEST_DETAIL = "Invalid DCF input"
DCF_COMPUTE_FAILURE_DETAIL = "DCF compute failed"


class _WindowRateLimiter:
    def __init__(self, *, max_requests: int, window_seconds: float) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._state: dict[str, tuple[float, int]] = {}

    def allow(self, key: str, now: float) -> bool:
        current = self._state.get(key)
        if current is None:
            self._state[key] = (now, 1)
            return True

        window_start, count = current
        if now - window_start >= self._window_seconds:
            self._state[key] = (now, 1)
            return True

        if count >= self._max_requests:
            return False

        self._state[key] = (window_start, count + 1)
        return True

    def reset(self) -> None:
        self._state.clear()


def _compute_rate_limit_config() -> tuple[int, float]:
    raw_max = os.getenv("DCF_COMPUTE_RATE_LIMIT_MAX", "30")
    raw_window = os.getenv("DCF_COMPUTE_RATE_LIMIT_WINDOW_SECONDS", "60")
    try:
        max_requests = max(1, int(raw_max))
    except ValueError:
        max_requests = 30
    try:
        window_seconds = max(1.0, float(raw_window))
    except ValueError:
        window_seconds = 60.0
    return max_requests, window_seconds


_MAX_REQUESTS, _WINDOW_SECONDS = _compute_rate_limit_config()
_compute_rate_limiter = _WindowRateLimiter(
    max_requests=_MAX_REQUESTS,
    window_seconds=_WINDOW_SECONDS,
)


def _client_id(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        ip = forwarded_for.split(",")[0].strip()
        if ip:
            return ip
    return request.client.host if request.client else "unknown"


def _enforce_dcf_rate_limit(request: Request) -> None:
    now = time.monotonic()
    if not _compute_rate_limiter.allow(_client_id(request), now):
        raise HTTPException(status_code=429, detail="Too many requests")


def _reset_rate_limiter_for_tests() -> None:
    _compute_rate_limiter.reset()


@app.get("/sec/search")
def sec_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
) -> dict[str, object]:
    try:
        results = search_companies(q, limit=limit)
    except (RuntimeError, requests.RequestException) as exc:
        logger.exception("SEC search failed")
        raise HTTPException(status_code=500, detail=SEC_SEARCH_FAILURE_DETAIL) from exc
    return {"results": results}


@app.get("/sec/facts")
def sec_facts(symbol: str = Query(..., min_length=1)) -> object:
    try:
        return fetch_company_facts(symbol)
    except ValueError as exc:
        logger.warning("Unknown ticker requested: %s", symbol)
        raise HTTPException(status_code=404, detail=SEC_FACTS_NOT_FOUND_DETAIL) from exc
    except (RuntimeError, requests.RequestException) as exc:
        logger.exception("SEC facts fetch failed")
        raise HTTPException(status_code=500, detail=SEC_FACTS_FAILURE_DETAIL) from exc


@app.post(
    "/dcf/compute",
    response_model=WorkbenchResponse,
    response_model_by_alias=True,
)
def dcf_compute(payload: WorkbenchRequest, request: Request) -> WorkbenchResponse:
    _enforce_dcf_rate_limit(request)
    try:
        return run_workbench(payload)
    except ValueError as exc:
        logger.warning("DCF compute failed: %s", exc)
        raise HTTPException(status_code=400, detail=DCF_COMPUTE_BAD_REQUEST_DETAIL) from exc
    except RuntimeError as exc:
        logger.exception("DCF compute error")
        raise HTTPException(status_code=500, detail=DCF_COMPUTE_FAILURE_DETAIL) from exc
