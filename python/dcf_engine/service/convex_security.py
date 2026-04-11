from __future__ import annotations

import logging
import os
import time
from typing import Any, Callable, TypedDict

import requests
from convex import ConvexClient

logger = logging.getLogger(__name__)


class SharedRateLimitResult(TypedDict):
    allowed: bool
    retry_after_seconds: int | None


class ConvexSecurityStateClient:
    _MAX_ATTEMPTS = 3
    _BACKOFF_BASE_SECONDS = 0.5
    _BACKOFF_MAX_SECONDS = 4.0

    def __init__(self, convex_url: str | None = None, sync_token: str | None = None) -> None:
        self._convex_url = convex_url or os.getenv("CONVEX_URL")
        if not self._convex_url:
            raise ValueError("CONVEX_URL is required")
        self._sync_token = sync_token or os.getenv("DAMODARAN_SYNC_TOKEN")
        if not self._sync_token:
            raise ValueError("DAMODARAN_SYNC_TOKEN is required")
        self._client = ConvexClient(self._convex_url)

    def _sanitize_args(self, args: dict[str, Any] | None) -> dict[str, Any] | None:
        if args is None:
            return None
        sanitized: dict[str, Any] = {}
        for key, value in args.items():
            if key == "syncToken":
                sanitized[key] = "***"
            else:
                sanitized[key] = value
        return sanitized

    def _is_transient_error(self, exc: Exception) -> bool:
        if isinstance(exc, (TimeoutError, OSError)):
            return True
        if isinstance(exc, requests.RequestException):
            response = getattr(exc, "response", None)
            if response is not None:
                return response.status_code == 429 or response.status_code >= 500
            return True
        return False

    def _execute(
        self,
        operation: str,
        args: dict[str, Any],
        func: Callable[[], Any],
    ) -> Any:
        attempt = 0
        while True:
            try:
                return func()
            except Exception as exc:
                attempt += 1
                if self._is_transient_error(exc) and attempt < self._MAX_ATTEMPTS:
                    delay = min(
                        self._BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)),
                        self._BACKOFF_MAX_SECONDS,
                    )
                    logger.warning(
                        "Transient Convex security-state error during %s (attempt %s/%s); retrying in %.1fs.",
                        operation,
                        attempt,
                        self._MAX_ATTEMPTS,
                        delay,
                        exc_info=exc,
                    )
                    time.sleep(delay)
                    continue

                sanitized = self._sanitize_args(args)
                logger.error(
                    "Convex security-state %s failed with args=%s",
                    operation,
                    sanitized,
                    exc_info=exc,
                )
                raise RuntimeError(
                    f"Convex security-state {operation} failed with args {sanitized}"
                ) from exc

    def _mutation(self, name: str, args: dict[str, Any]) -> Any:
        payload = {"syncToken": self._sync_token, **args}
        return self._execute(
            f"mutation {name}",
            payload,
            lambda: self._client.mutation(name, payload),
        )

    def reserve_nonce(self, nonce: str, ttl_ms: int) -> bool:
        result = self._mutation(
            "securityAuth:reserveNonce",
            {
                "nonce": nonce,
                "ttlMs": ttl_ms,
            },
        )
        return bool(result.get("reserved") is True)

    def mark_nonce_used(self, nonce: str, ttl_ms: int) -> bool:
        result = self._mutation(
            "securityAuth:markNonceUsed",
            {
                "nonce": nonce,
                "ttlMs": ttl_ms,
            },
        )
        return bool(result.get("marked") is True)

    def release_pending_nonce(self, nonce: str) -> None:
        self._mutation(
            "securityAuth:releasePendingNonce",
            {
                "nonce": nonce,
            },
        )

    def hit_rate_limit_bucket(
        self,
        bucket_key: str,
        limit: int,
        window_ms: int,
    ) -> SharedRateLimitResult:
        result = self._mutation(
            "securityRateLimit:hitBucket",
            {
                "bucketKey": bucket_key,
                "limit": limit,
                "windowMs": window_ms,
            },
        )
        retry_after = result.get("retryAfterSeconds")
        return {
            "allowed": result.get("allowed") is True,
            "retry_after_seconds": (
                int(retry_after) if isinstance(retry_after, (int, float)) else None
            ),
        }

