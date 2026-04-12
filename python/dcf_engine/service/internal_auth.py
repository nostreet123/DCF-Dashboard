from __future__ import annotations

import hashlib
import hmac
import os
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


def _internal_key() -> str | None:
    secret = os.getenv("DCF_ENGINE_INTERNAL_KEY")
    if not secret:
        return None
    return secret


def _allow_unsigned_requests() -> bool:
    return os.getenv("DCF_ENGINE_ALLOW_UNSIGNED") == "1"


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


def _shared_security_client() -> ConvexSecurityStateClient:
    return ConvexSecurityStateClient()


def _reserve_nonce_shared(nonce: str) -> bool:
    return _shared_security_client().reserve_nonce(nonce, NONCE_TTL_MS)


def _mark_nonce_used_shared(nonce: str) -> bool:
    return _shared_security_client().mark_nonce_used(nonce, NONCE_TTL_MS)

async def require_internal_request(request: Request) -> None:
    secret = _internal_key()
    if secret is None:
        if _allow_unsigned_requests():
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

    try:
        reserved = await anyio.to_thread.run_sync(_reserve_nonce_shared, nonce)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail="Service not configured") from exc

    if not reserved:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        marked = await anyio.to_thread.run_sync(_mark_nonce_used_shared, nonce)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="Service not configured") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Service not configured") from exc
    if not marked:
        raise HTTPException(status_code=401, detail="Unauthorized")
