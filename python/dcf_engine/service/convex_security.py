from __future__ import annotations

import logging
import os
from typing import Any, TypedDict

from dcf_engine.convex_transport import ConvexTransport

logger = logging.getLogger(__name__)


class SharedRateLimitResult(TypedDict):
    allowed: bool
    retry_after_seconds: int | None


class ConvexSecurityStateClient:
    def __init__(self, convex_url: str | None = None, sync_token: str | None = None) -> None:
        resolved_url = convex_url or os.getenv("CONVEX_URL")
        if not resolved_url:
            raise ValueError("CONVEX_URL is required")
        self._sync_token = sync_token or os.getenv("DAMODARAN_SYNC_TOKEN")
        if not self._sync_token:
            raise ValueError("DAMODARAN_SYNC_TOKEN is required")
        try:
            self._transport = ConvexTransport(
                resolved_url,
                sync_token=self._sync_token,
                max_attempts=1,
                retry_transient=False,
            )
        except Exception as exc:
            raise RuntimeError("Convex security-state client failed to initialize") from exc

    def _mutation(self, name: str, args: dict[str, Any]) -> Any:
        payload = {**args, "syncToken": self._sync_token}
        return self._transport.mutation(name, payload, include_token=False)

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
