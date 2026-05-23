from __future__ import annotations

from functools import lru_cache
import hashlib
import hmac
import os
import threading
import time
from urllib.parse import urlsplit

import anyio
from fastapi import HTTPException, Request

from dcf_engine.service.convex_security import ConvexSecurityStateClient


INTERNAL_SIGNATURE_HEADER = "x-dcf-internal-signature"
INTERNAL_TIMESTAMP_HEADER = "x-dcf-internal-ts"
INTERNAL_NONCE_HEADER = "x-dcf-internal-nonce"
INTERNAL_MAX_SKEW_MS = 5 * 60 * 1000
NONCE_TTL_MS = INTERNAL_MAX_SKEW_MS
SECURITY_BACKEND_UNAVAILABLE_DETAIL = "Security backend unavailable"
SHARED_NONCE_STORE_NOT_CONFIGURED_DETAIL = "Shared nonce store is not configured"
INTERNAL_AUTH_PATHS = {
    "/sec/search",
    "/sec/facts",
    "/company/search",
    "/company/detail",
    "/company/import/parse",
    "/dcf/compute",
}

_nonce_lock = threading.Lock()
_seen_nonces: dict[str, int] = {}


def internal_key() -> str | None:
    secret = os.getenv("DCF_ENGINE_INTERNAL_KEY")
    if not secret:
        return None
    return secret


def allow_unsigned_requests() -> bool:
    return (
        os.getenv("DCF_ENGINE_ALLOW_UNSIGNED") == "1"
        and not os.getenv("DCF_ENGINE_INTERNAL_KEY")
    )


def allow_process_local_nonces() -> bool:
    return os.getenv("DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES") == "1"


def shared_nonce_store_configured() -> bool:
    return bool(os.getenv("CONVEX_URL") and os.getenv("DAMODARAN_SYNC_TOKEN"))


def _canonical_path(request: Request) -> str:
    parsed = urlsplit(str(request.url))
    if parsed.query:
        return f"{parsed.path}?{parsed.query}"
    return parsed.path


def _canonical_payload(
    *,
    method: str,
    path_and_query: str,
    timestamp_ms: str,
    nonce: str,
    body_hash: str,
) -> str:
    return f"{method}\n{path_and_query}\n{timestamp_ms}\n{nonce}\n{body_hash}"


@lru_cache(maxsize=1)
def shared_security_client() -> ConvexSecurityStateClient:
    return ConvexSecurityStateClient()


def _prune_expired_nonces(now_ms: int) -> None:
    expired = [nonce for nonce, expires_at in _seen_nonces.items() if expires_at <= now_ms]
    for nonce in expired:
        _seen_nonces.pop(nonce, None)


def _reserve_process_local_nonce(nonce: str, now_ms: int) -> bool:
    with _nonce_lock:
        _prune_expired_nonces(now_ms)
        expires_at = _seen_nonces.get(nonce)
        if expires_at is not None and expires_at > now_ms:
            return False
        _seen_nonces[nonce] = now_ms + NONCE_TTL_MS
        return True


def _reserve_nonce_shared(nonce: str) -> bool:
    return shared_security_client().reserve_nonce(nonce, NONCE_TTL_MS)


def _mark_nonce_used_shared(nonce: str) -> bool:
    return shared_security_client().mark_nonce_used(nonce, NONCE_TTL_MS)


async def _reserve_nonce(nonce: str, now_ms: int) -> bool:
    if not shared_nonce_store_configured():
        if allow_process_local_nonces():
            return _reserve_process_local_nonce(nonce, now_ms)
        raise HTTPException(status_code=503, detail=SHARED_NONCE_STORE_NOT_CONFIGURED_DETAIL)
    try:
        return await anyio.to_thread.run_sync(_reserve_nonce_shared, nonce)
    except ValueError as exc:
        if allow_process_local_nonces():
            return _reserve_process_local_nonce(nonce, now_ms)
        raise HTTPException(status_code=503, detail="Service not configured") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=SECURITY_BACKEND_UNAVAILABLE_DETAIL) from exc


async def _mark_nonce_used(nonce: str) -> bool:
    if not shared_nonce_store_configured():
        if allow_process_local_nonces():
            return True
        raise HTTPException(status_code=503, detail=SHARED_NONCE_STORE_NOT_CONFIGURED_DETAIL)
    try:
        return await anyio.to_thread.run_sync(_mark_nonce_used_shared, nonce)
    except ValueError as exc:
        if allow_process_local_nonces():
            return True
        raise HTTPException(status_code=503, detail="Service not configured") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=SECURITY_BACKEND_UNAVAILABLE_DETAIL) from exc


async def require_internal_request(request: Request) -> None:
    if getattr(request.state, "internal_request_verified", False):
        return

    secret = internal_key()
    if secret is None:
        if allow_unsigned_requests():
            return
        raise HTTPException(status_code=503, detail="Service not configured")

    signature = request.headers.get(INTERNAL_SIGNATURE_HEADER, "").strip()
    timestamp_ms = request.headers.get(INTERNAL_TIMESTAMP_HEADER, "").strip()
    nonce = request.headers.get(INTERNAL_NONCE_HEADER, "").strip()
    if not signature or not timestamp_ms or not nonce:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        timestamp_value = int(timestamp_ms)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Unauthorized") from exc

    now_ms = int(time.time() * 1000)
    if abs(now_ms - timestamp_value) > INTERNAL_MAX_SKEW_MS:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.body()
    body_hash = hashlib.sha256(body).hexdigest()
    payload = _canonical_payload(
        method=request.method.upper(),
        path_and_query=_canonical_path(request),
        timestamp_ms=timestamp_ms,
        nonce=nonce,
        body_hash=body_hash,
    )
    expected = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not await _reserve_nonce(nonce, now_ms):
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not await _mark_nonce_used(nonce):
        raise HTTPException(status_code=401, detail="Unauthorized")
