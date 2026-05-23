from __future__ import annotations

import logging
import time
from typing import Any, Callable

import requests
from convex import ConvexClient

logger = logging.getLogger(__name__)


class ConvexTransport:
    _BACKOFF_BASE_SECONDS = 0.5
    _BACKOFF_MAX_SECONDS = 4.0

    def __init__(
        self,
        convex_url: str,
        *,
        sync_token: str | None = None,
        max_attempts: int = 3,
        retry_transient: bool = True,
    ) -> None:
        self._convex_url = convex_url
        self._sync_token = sync_token
        self._max_attempts = max(1, max_attempts)
        self._retry_transient = retry_transient
        self._client = ConvexClient(convex_url)

    @property
    def convex_url(self) -> str:
        return self._convex_url

    @property
    def sync_token(self) -> str | None:
        return self._sync_token

    def clone(self) -> ConvexTransport:
        return ConvexTransport(
            self._convex_url,
            sync_token=self._sync_token,
            max_attempts=self._max_attempts,
            retry_transient=self._retry_transient,
        )

    def token_arg(self) -> dict[str, Any]:
        return {"syncToken": self._sync_token} if self._sync_token is not None else {}

    def sanitize_args(self, args: dict[str, Any] | None) -> dict[str, Any] | None:
        if args is None:
            return None
        sanitized: dict[str, Any] = {}
        for key, value in args.items():
            if key == "syncToken":
                sanitized[key] = "***"
            elif isinstance(value, list):
                sanitized[key] = f"<{len(value)} items>"
            else:
                sanitized[key] = value
        return sanitized

    def is_transient_error(self, exc: Exception) -> bool:
        if isinstance(exc, (TimeoutError, OSError)):
            return True
        if isinstance(exc, requests.RequestException):
            resp = getattr(exc, "response", None)
            if resp is not None:
                return resp.status_code == 429 or resp.status_code >= 500
            return True
        return False

    def execute(
        self,
        operation: str,
        args: dict[str, Any] | None,
        func: Callable[[], Any],
    ) -> Any:
        attempt = 0
        while True:
            try:
                return func()
            except Exception as exc:
                attempt += 1
                if (
                    self._retry_transient
                    and self.is_transient_error(exc)
                    and attempt < self._max_attempts
                ):
                    delay = min(
                        self._BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)),
                        self._BACKOFF_MAX_SECONDS,
                    )
                    logger.warning(
                        "Transient Convex error during %s (attempt %s/%s); retrying in %.1fs.",
                        operation,
                        attempt,
                        self._max_attempts,
                        delay,
                        exc_info=exc,
                    )
                    time.sleep(delay)
                    continue
                sanitized = self.sanitize_args(args)
                logger.error(
                    "Convex %s failed with args=%s",
                    operation,
                    sanitized,
                    exc_info=exc,
                )
                raise RuntimeError(
                    f"Convex {operation} failed with args {sanitized}"
                ) from exc

    def query(
        self,
        name: str,
        args: dict[str, Any] | None = None,
        *,
        include_token: bool = False,
    ) -> Any:
        payload = dict(args or {})
        if include_token:
            payload.update(self.token_arg())
        return self.execute(
            f"query {name}",
            payload,
            lambda: self._client.query(name, payload),
        )

    def mutation(
        self,
        name: str,
        args: dict[str, Any] | None = None,
        *,
        include_token: bool = True,
    ) -> Any:
        payload = dict(args or {})
        if include_token:
            payload.update(self.token_arg())
        return self.execute(
            f"mutation {name}",
            payload,
            lambda: self._client.mutation(name, payload),
        )
