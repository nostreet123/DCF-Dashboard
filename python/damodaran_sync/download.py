from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import hashlib
import threading
import time
from typing import Callable
from urllib.parse import urlparse, unquote

import requests
from requests import Response
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from damodaran_sync.config import DEFAULT_RATE_LIMIT_SECONDS, DEFAULT_REQUEST_TIMEOUT, get_raw_cache_dir


class TransientHttpError(RuntimeError):
    def __init__(self, status_code: int, url: str) -> None:
        super().__init__(f"Transient HTTP error {status_code} for {url}")
        self.status_code = status_code
        self.url = url


class RateLimiter:
    def __init__(self, min_interval_seconds: float = DEFAULT_RATE_LIMIT_SECONDS) -> None:
        self._min_interval = min_interval_seconds
        self._lock = threading.Lock()
        self._last_time = 0.0

    def wait(self) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_time
            remaining = self._min_interval - elapsed
            if remaining > 0:
                time.sleep(remaining)
            self._last_time = time.monotonic()


class HttpClient:
    def __init__(
        self,
        session: requests.Session | None = None,
        rate_limiter: RateLimiter | None = None,
        timeout: int = DEFAULT_REQUEST_TIMEOUT,
    ) -> None:
        self._session = session or requests.Session()
        self._rate_limiter = rate_limiter or RateLimiter()
        self._timeout = timeout

    @retry(
        retry=retry_if_exception_type((requests.RequestException, TransientHttpError)),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        stop=stop_after_attempt(5),
        reraise=True,
    )
    def get(self, url: str, **kwargs) -> Response:
        self._rate_limiter.wait()
        response = self._session.get(url, timeout=self._timeout, **kwargs)
        if response.status_code == 429 or response.status_code >= 500:
            raise TransientHttpError(response.status_code, url)
        return response


@dataclass(frozen=True)
class DownloadResult:
    url: str
    path: Path
    sha256: str
    size_bytes: int
    from_cache: bool


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sha256_stream(write_chunk: Callable[[bytes], None], iterator) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    for chunk in iterator:
        if not chunk:
            continue
        digest.update(chunk)
        size += len(chunk)
        write_chunk(chunk)
    return digest.hexdigest(), size


def _file_name_from_url(url: str) -> str:
    path = urlparse(url).path
    return unquote(Path(path).name)


def download_file(
    url: str,
    http_client: HttpClient | None = None,
    cache_dir: Path | None = None,
) -> DownloadResult:
    client = http_client or get_default_http_client()
    raw_dir = cache_dir or get_raw_cache_dir()
    raw_dir.mkdir(parents=True, exist_ok=True)

    file_name = _file_name_from_url(url)
    target_path = raw_dir / file_name
    if target_path.exists():
        return DownloadResult(
            url=url,
            path=target_path,
            sha256=_sha256_file(target_path),
            size_bytes=target_path.stat().st_size,
            from_cache=True,
        )

    response = client.get(url, stream=True)
    response.raise_for_status()

    temp_path = target_path.with_suffix(target_path.suffix + ".part")
    with temp_path.open("wb") as handle:
        sha256, size = _sha256_stream(handle.write, response.iter_content(chunk_size=1024 * 1024))

    temp_path.replace(target_path)
    return DownloadResult(
        url=url,
        path=target_path,
        sha256=sha256,
        size_bytes=size,
        from_cache=False,
    )


_DEFAULT_HTTP_CLIENT: HttpClient | None = None
_DEFAULT_HTTP_CLIENT_LOCK = threading.Lock()


def get_default_http_client() -> HttpClient:
    global _DEFAULT_HTTP_CLIENT
    if _DEFAULT_HTTP_CLIENT is None:
        with _DEFAULT_HTTP_CLIENT_LOCK:
            if _DEFAULT_HTTP_CLIENT is None:
                _DEFAULT_HTTP_CLIENT = HttpClient()
    return _DEFAULT_HTTP_CLIENT
