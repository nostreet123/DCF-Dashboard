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

from damodaran_sync.config import DEFAULT_REQUEST_TIMEOUT, get_raw_cache_dir, get_rate_limit_seconds


class TransientHttpError(RuntimeError):
    def __init__(self, status_code: int, url: str) -> None:
        super().__init__(f"Transient HTTP error {status_code} for {url}")
        self.status_code = status_code
        self.url = url


class RateLimiter:
    def __init__(self, min_interval_seconds: float | None = None) -> None:
        self._min_interval = get_rate_limit_seconds() if min_interval_seconds is None else min_interval_seconds
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

    @retry(
        retry=retry_if_exception_type((requests.RequestException, TransientHttpError)),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        stop=stop_after_attempt(5),
        reraise=True,
    )
    def head(self, url: str, **kwargs) -> Response:
        self._rate_limiter.wait()
        response = self._session.head(url, timeout=self._timeout, **kwargs)
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
    etag: str | None = None
    last_modified: str | None = None
    not_modified: bool = False


@dataclass(frozen=True)
class ProbeResult:
    url: str
    status_code: int
    etag: str | None
    last_modified: str | None
    not_modified: bool


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sha256_stream(write_chunk: Callable[[bytes], int], iterator) -> tuple[str, int]:
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
    decoded_path = unquote(urlparse(url).path)
    return Path(decoded_path).name


def download_file(
    url: str,
    http_client: HttpClient | None = None,
    cache_dir: Path | None = None,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
    allow_not_modified: bool = True,
) -> DownloadResult:
    client = http_client or get_default_http_client()
    raw_dir = cache_dir or get_raw_cache_dir()
    raw_dir.mkdir(parents=True, exist_ok=True)

    file_name = _file_name_from_url(url)
    target_path = raw_dir / file_name
    use_conditional = allow_not_modified and bool(etag or last_modified)

    if target_path.exists() and not use_conditional:
        return DownloadResult(
            url=url,
            path=target_path,
            sha256=_sha256_file(target_path),
            size_bytes=target_path.stat().st_size,
            from_cache=True,
        )

    request_headers: dict[str, str] | None = None
    if use_conditional:
        request_headers = {}
        if etag:
            request_headers["If-None-Match"] = etag
        if last_modified:
            request_headers["If-Modified-Since"] = last_modified

    response = client.get(url, stream=True, headers=request_headers)
    response_close = getattr(response, "close", None)
    if response.status_code == 304:
        if target_path.exists():
            response_etag = response.headers.get("ETag") or etag
            response_last_modified = response.headers.get("Last-Modified") or last_modified
            if response_close is not None:
                response_close()
            return DownloadResult(
                url=url,
                path=target_path,
                sha256=_sha256_file(target_path),
                size_bytes=target_path.stat().st_size,
                from_cache=True,
                etag=response_etag,
                last_modified=response_last_modified,
                not_modified=True,
            )
        if not allow_not_modified:
            if response_close is not None:
                response_close()
            raise RuntimeError(f"Received 304 for {url} but cached file is missing")
        if response_close is not None:
            response_close()
        return download_file(
            url,
            http_client=http_client,
            cache_dir=cache_dir,
            etag=None,
            last_modified=None,
            allow_not_modified=False,
        )

    response.raise_for_status()
    response_etag = response.headers.get("ETag")
    response_last_modified = response.headers.get("Last-Modified")

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
        etag=response_etag,
        last_modified=response_last_modified,
    )


def probe_remote(
    url: str,
    http_client: HttpClient | None = None,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
) -> ProbeResult | None:
    if not (etag or last_modified):
        return None
    client = http_client or get_default_http_client()
    request_headers: dict[str, str] = {}
    if etag:
        request_headers["If-None-Match"] = etag
    if last_modified:
        request_headers["If-Modified-Since"] = last_modified

    response = client.head(url, headers=request_headers, allow_redirects=True)
    response_close = getattr(response, "close", None)
    try:
        if response.status_code == 304:
            return ProbeResult(
                url=url,
                status_code=304,
                etag=response.headers.get("ETag") or etag,
                last_modified=response.headers.get("Last-Modified") or last_modified,
                not_modified=True,
            )
        if response.status_code == 404:
            return ProbeResult(
                url=url,
                status_code=404,
                etag=None,
                last_modified=None,
                not_modified=False,
            )
        if response.status_code == 405:
            return None
        response.raise_for_status()
        return ProbeResult(
            url=url,
            status_code=response.status_code,
            etag=response.headers.get("ETag"),
            last_modified=response.headers.get("Last-Modified"),
            not_modified=False,
        )
    finally:
        if response_close is not None:
            response_close()


_DEFAULT_HTTP_CLIENTS = threading.local()
_DEFAULT_HTTP_CLIENT_LOCK = threading.Lock()
_DEFAULT_RATE_LIMITER: RateLimiter | None = None


def _get_shared_rate_limiter() -> RateLimiter:
    global _DEFAULT_RATE_LIMITER
    if _DEFAULT_RATE_LIMITER is None:
        with _DEFAULT_HTTP_CLIENT_LOCK:
            if _DEFAULT_RATE_LIMITER is None:
                _DEFAULT_RATE_LIMITER = RateLimiter()
    return _DEFAULT_RATE_LIMITER


def get_default_http_client() -> HttpClient:
    client = getattr(_DEFAULT_HTTP_CLIENTS, "client", None)
    if client is None:
        client = HttpClient(rate_limiter=_get_shared_rate_limiter())
        _DEFAULT_HTTP_CLIENTS.client = client
    return client


class Downloader:
    def __init__(
        self,
        http_client: HttpClient | None = None,
        cache_dir: Path | None = None,
    ) -> None:
        self._http_client = http_client
        self._cache_dir = cache_dir

    def download(self, url: str, filepath: str | Path | None = None) -> DownloadResult:
        result = download_file(url, http_client=self._http_client, cache_dir=self._cache_dir)
        if filepath is None:
            return result
        target = Path(filepath)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.resolve() != result.path.resolve():
            target.write_bytes(result.path.read_bytes())
        return DownloadResult(
            url=result.url,
            path=target,
            sha256=result.sha256,
            size_bytes=result.size_bytes,
            from_cache=result.from_cache,
            etag=result.etag,
            last_modified=result.last_modified,
            not_modified=result.not_modified,
        )
