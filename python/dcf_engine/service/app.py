from __future__ import annotations

import ipaddress
import math
import logging
import os

from fastapi import Depends, FastAPI, HTTPException, Query, Request
import requests

from dcf_engine.service.convex_security import ConvexSecurityStateClient
from dcf_engine.service.internal_auth import require_internal_request
from dcf_engine.service.sec_edgar import fetch_company_facts, search_companies
from dcf_engine.workbench.run import run_workbench
from dcf_engine.workbench.schema import WorkbenchRequest, WorkbenchResponse

logger = logging.getLogger(__name__)

_DOCS_ENABLED = os.getenv("DCF_ENGINE_EXPOSE_DOCS") == "1"

app = FastAPI(
    title="DCF Engine Service",
    version="0.1.0",
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
)

SEC_SEARCH_FAILURE_DETAIL = "SEC search failed"
SEC_FACTS_NOT_FOUND_DETAIL = "Unknown ticker"
SEC_FACTS_FAILURE_DETAIL = "SEC facts fetch failed"
DCF_COMPUTE_BAD_REQUEST_DETAIL = "Invalid DCF input"
DCF_COMPUTE_FAILURE_DETAIL = "DCF compute failed"
_MAX_RATE_LIMIT_REQUESTS = 10_000
_MAX_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000


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


def _allow_unsigned_requests() -> bool:
    return os.getenv("DCF_ENGINE_ALLOW_UNSIGNED") == "1" and not os.getenv("DCF_ENGINE_INTERNAL_KEY")


def _rate_limit_window_ms() -> int:
    window_seconds = _WINDOW_SECONDS
    if not math.isfinite(window_seconds):
        window_seconds = _MAX_RATE_LIMIT_WINDOW_MS / 1000.0
    window_seconds = min(max(1.0, window_seconds), _MAX_RATE_LIMIT_WINDOW_MS / 1000.0)
    return int(window_seconds * 1000)


def _trusted_proxy_mode() -> str:
    mode = os.getenv("DCF_TRUSTED_PROXY_MODE", "off").strip().lower()
    if mode in {"off", "allowlist"}:
        return mode
    return "off"


def _trusted_proxy_networks() -> list[ipaddress._BaseNetwork]:
    raw = os.getenv("DCF_TRUSTED_PROXY_CIDRS", "")
    networks: list[ipaddress._BaseNetwork] = []
    for token in raw.split(","):
        candidate = token.strip()
        if not candidate:
            continue
        try:
            network = ipaddress.ip_network(candidate, strict=False)
        except ValueError:
            logger.warning("Ignoring invalid trusted proxy CIDR: %s", candidate)
            continue
        networks.append(network)
    return networks


def _normalize_ip(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    try:
        parsed = ipaddress.ip_address(stripped)
    except ValueError:
        return None
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped is not None:
        return str(parsed.ipv4_mapped)
    return str(parsed)


def _is_trusted_proxy(remote_ip: str | None) -> bool:
    if _trusted_proxy_mode() != "allowlist":
        return False
    normalized_remote = _normalize_ip(remote_ip)
    if not normalized_remote:
        return False
    parsed_remote = ipaddress.ip_address(normalized_remote)
    return any(parsed_remote in network for network in _trusted_proxy_networks())


def _client_id(request: Request) -> str:
    remote = _normalize_ip(request.client.host if request.client else None)
    fallback = remote or "unknown"
    if not _is_trusted_proxy(remote):
        return fallback

    forwarded_for = request.headers.get("x-forwarded-for")
    if not forwarded_for:
        return fallback
    forwarded = _normalize_ip(forwarded_for.split(",")[0])
    return forwarded or fallback


def _enforce_dcf_rate_limit(request: Request) -> None:
    client_id = _client_id(request)
    bucket_key = f"fastapi:dcf:compute:ip:{client_id}"
    limit = min(_MAX_REQUESTS, _MAX_RATE_LIMIT_REQUESTS)
    window_ms = _rate_limit_window_ms()
    try:
        result = ConvexSecurityStateClient().hit_rate_limit_bucket(
            bucket_key,
            limit,
            window_ms,
        )
    except ValueError as exc:
        if _allow_unsigned_requests():
            return
        raise HTTPException(status_code=503, detail="Service not configured") from exc
    except RuntimeError as exc:
        if _allow_unsigned_requests():
            return
        raise HTTPException(status_code=503, detail="Service not configured") from exc

    if not result["allowed"]:
        raise HTTPException(status_code=429, detail="Too many requests")


def _reset_rate_limiter_for_tests() -> None:
    # No-op: rate-limit state is stored in Convex.
    return None


@app.get("/sec/search")
def sec_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    _: None = Depends(require_internal_request),
) -> dict[str, object]:
    try:
        results = search_companies(q, limit=limit)
    except (RuntimeError, requests.RequestException) as exc:
        logger.exception("SEC search failed")
        raise HTTPException(status_code=500, detail=SEC_SEARCH_FAILURE_DETAIL) from exc
    return {"results": results}


@app.get("/sec/facts")
def sec_facts(
    symbol: str = Query(..., min_length=1),
    _: None = Depends(require_internal_request),
) -> object:
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
def dcf_compute(
    payload: WorkbenchRequest,
    request: Request,
    _: None = Depends(require_internal_request),
) -> WorkbenchResponse:
    _enforce_dcf_rate_limit(request)
    try:
        return run_workbench(payload)
    except ValueError as exc:
        logger.warning("DCF compute failed: %s", exc)
        raise HTTPException(status_code=400, detail=DCF_COMPUTE_BAD_REQUEST_DETAIL) from exc
    except RuntimeError as exc:
        logger.exception("DCF compute error")
        raise HTTPException(status_code=500, detail=DCF_COMPUTE_FAILURE_DETAIL) from exc
