from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import hashlib
import ipaddress
from ipaddress import IPv4Address, IPv6Address
import os
import re
import socket
import threading
import time
from typing import Callable, Collection, Any
from urllib.parse import urlparse, unquote

import requests
from requests import Response
from requests.adapters import HTTPAdapter
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)
from urllib3 import PoolManager
from urllib3.connection import HTTPSConnection
from urllib3.connectionpool import HTTPSConnectionPool
from urllib3.exceptions import NewConnectionError
from urllib3.poolmanager import PoolKey, _default_key_normalizer
from urllib3.util import connection as urllib3_connection

from damodaran_sync.config import DEFAULT_REQUEST_TIMEOUT, get_raw_cache_dir, get_rate_limit_seconds

DEFAULT_ALLOWED_ASSET_HOSTS = {
    "pages.stern.nyu.edu",
    "stern.nyu.edu",
    "www.stern.nyu.edu",
}
# Keep the download cap close to Damodaran workbook sizes; larger mirrors must
# opt in explicitly through DAMODARAN_DOWNLOAD_MAX_BYTES.
DEFAULT_MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024


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


class _PinnedHTTPSConnection(HTTPSConnection):
    def __init__(self, *args, pinned_ip: str | None = None, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._pinned_ip = pinned_ip

    def _new_conn(self) -> Any:
        target_host = self._pinned_ip or self._dns_host
        try:
            return urllib3_connection.create_connection(
                (target_host, self.port),
                self.timeout,
                source_address=self.source_address,
                socket_options=self.socket_options,
            )
        except OSError as exc:
            raise NewConnectionError(
                self,
                f"Failed to establish a new connection to pinned address {target_host}: {exc}",
            ) from exc


class _PinnedHTTPSConnectionPool(HTTPSConnectionPool):
    ConnectionCls = _PinnedHTTPSConnection


class _PinnedHTTPSAdapter(HTTPAdapter):
    def __init__(self, pinned_ip: str) -> None:
        self._pinned_ip = pinned_ip
        super().__init__()

    def init_poolmanager(self, connections: int, maxsize: int, block: bool = False, **pool_kwargs: Any) -> None:
        pool_kwargs["pinned_ip"] = self._pinned_ip
        self.poolmanager = PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            **pool_kwargs,
        )
        self.poolmanager.pool_classes_by_scheme["https"] = _PinnedHTTPSConnectionPool
        self.poolmanager.key_fn_by_scheme["https"] = _pinned_pool_key


def _pinned_pool_key(request_context: dict[str, Any]) -> PoolKey:
    key_context = request_context.copy()
    key_context.pop("pinned_ip", None)
    return _default_key_normalizer(PoolKey, key_context)


class HttpClient:
    def __init__(
        self,
        session: requests.Session | None = None,
        rate_limiter: RateLimiter | None = None,
        timeout: int = DEFAULT_REQUEST_TIMEOUT,
        pin_connections: bool | None = None,
    ) -> None:
        self._session = session or requests.Session()
        self._rate_limiter = rate_limiter or RateLimiter()
        self._timeout = timeout
        self._pin_connections = session is None if pin_connections is None else pin_connections

    def _request(self, method: str, url: str, **kwargs) -> Response:
        if not self._pin_connections:
            request = getattr(self._session, method)
            return request(url, timeout=self._timeout, **kwargs)

        pinned_ip = _resolve_pinned_address(url)
        session = requests.Session()
        session.headers.update(self._session.headers)
        session.mount("https://", _PinnedHTTPSAdapter(pinned_ip))
        return session.request(method.upper(), url, timeout=self._timeout, **kwargs)

    @retry(
        retry=retry_if_exception_type((requests.RequestException, TransientHttpError)),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        stop=stop_after_attempt(5),
        reraise=True,
    )
    def get(self, url: str, **kwargs) -> Response:
        self._rate_limiter.wait()
        response = self._request("get", url, **kwargs)
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
        response = self._request("head", url, **kwargs)
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


def _env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    return value if value > 0 else default


def _max_download_bytes() -> int:
    return _env_int("DAMODARAN_DOWNLOAD_MAX_BYTES", DEFAULT_MAX_DOWNLOAD_BYTES)


def _configured_allowed_hosts(extra_allowed_hosts: Collection[str] | None = None) -> set[str]:
    raw_hosts = os.getenv("DAMODARAN_ALLOWED_ASSET_HOSTS")
    hosts = set(DEFAULT_ALLOWED_ASSET_HOSTS)
    if raw_hosts is not None:
        hosts = {host.strip().lower() for host in raw_hosts.split(",") if host.strip()}
    if extra_allowed_hosts:
        hosts.update(host.strip().lower() for host in extra_allowed_hosts if host.strip())
    return hosts


def _host_allowed(hostname: str, allowed_hosts: set[str]) -> bool:
    hostname = hostname.lower()
    for allowed in allowed_hosts:
        if allowed.startswith("."):
            suffix = allowed[1:]
            if hostname == suffix or hostname.endswith(f".{suffix}"):
                return True
        elif hostname == allowed:
            return True
    return False


def _address_is_disallowed(address: IPv4Address | IPv6Address) -> bool:
    return not address.is_global or address.is_multicast


def _is_unsafe_ip_literal(hostname: str) -> bool:
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    if address is None and re.fullmatch(r"[0-9A-Fa-fxX.]+", hostname):
        try:
            address = ipaddress.ip_address(socket.inet_aton(hostname))
        except OSError:
            return False
    if address is None:
        return False
    return _address_is_disallowed(address)


def _safe_resolved_addresses(hostname: str) -> list[str]:
    try:
        results = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return []
    safe: list[str] = []
    for result in results:
        sockaddr = result[4]
        if not sockaddr:
            continue
        raw_address = str(sockaddr[0])
        try:
            address = ipaddress.ip_address(raw_address)
        except ValueError:
            continue
        if _address_is_disallowed(address):
            raise ValueError(f"Download URL host resolves to a disallowed address: {hostname}")
        if raw_address not in safe:
            safe.append(raw_address)
    return safe


def _resolve_pinned_address(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.hostname:
        raise ValueError(f"Download URL must use https with a host: {url!r}")
    addresses = _safe_resolved_addresses(parsed.hostname)
    if not addresses:
        raise ValueError(f"Download URL host could not be resolved: {parsed.hostname}")
    return addresses[0]


def _extract_peer_ip(response: Response) -> str | None:
    raw = getattr(response, "raw", None)
    candidates: list[Any] = [
        getattr(getattr(raw, "connection", None), "sock", None),
        getattr(getattr(raw, "_connection", None), "sock", None),
        getattr(getattr(getattr(raw, "_fp", None), "fp", None), "raw", None),
    ]
    for candidate in candidates:
        sock = getattr(candidate, "_sock", candidate)
        getpeername = getattr(sock, "getpeername", None)
        if not callable(getpeername):
            continue
        try:
            peer = getpeername()
        except OSError:
            continue
        if isinstance(peer, tuple) and peer:
            return str(peer[0])
    return None


def _validate_response_peer(response: Response, url: str) -> None:
    peer_ip = _extract_peer_ip(response)
    if peer_ip is None:
        return
    try:
        address = ipaddress.ip_address(peer_ip)
    except ValueError:
        raise ValueError(f"Download connection peer is not a valid IP address for {url}") from None
    if _address_is_disallowed(address):
        raise ValueError(f"Download connection resolved to a disallowed address: {peer_ip}")


def validate_download_url(
    url: str,
    *,
    extra_allowed_hosts: Collection[str] | None = None,
) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError(f"Download URL must use https with a host: {url!r}")
    if parsed.username or parsed.password:
        raise ValueError(f"Download URL must not contain credentials: {url!r}")
    hostname = parsed.hostname.lower()
    if _is_unsafe_ip_literal(hostname):
        raise ValueError(f"Download URL host is not allowed: {hostname}")
    allowed_hosts = _configured_allowed_hosts(extra_allowed_hosts)
    if not _host_allowed(hostname, allowed_hosts):
        raise ValueError(f"Download URL host is not allowed: {hostname}")
    _safe_resolved_addresses(hostname)
    return url


def _sha256_stream(
    write_chunk: Callable[[bytes], int],
    iterator,
    *,
    max_bytes: int,
) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    for chunk in iterator:
        if not chunk:
            continue
        digest.update(chunk)
        size += len(chunk)
        if size > max_bytes:
            raise ValueError(f"Download exceeded maximum size of {max_bytes} bytes")
        write_chunk(chunk)
    return digest.hexdigest(), size


def _file_name_from_url(url: str) -> str:
    decoded_path = unquote(urlparse(url).path)
    name = Path(decoded_path).name
    if not name or name in {".", ".."}:
        raise ValueError(f"Could not derive a safe filename from URL: {url!r}")
    return name


def _cache_file_name_from_url(url: str) -> str:
    original_name = _file_name_from_url(url)
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", original_name).strip("._")
    if not safe_name:
        safe_name = "download"
    if len(safe_name) > 120:
        stem = Path(safe_name).stem[:80] or "download"
        suffix = Path(safe_name).suffix[:20]
        safe_name = f"{stem}{suffix}"
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    return f"{url_hash}-{safe_name}"


def _content_length_exceeds_limit(response: Response, max_bytes: int) -> bool:
    raw_length = response.headers.get("Content-Length")
    if raw_length is None:
        return False
    try:
        return int(raw_length) > max_bytes
    except ValueError:
        return False


def _reject_redirect_response(response: Response, url: str) -> None:
    if 300 <= response.status_code < 400 and response.status_code != 304:
        location = response.headers.get("Location")
        detail = f" to {location}" if location else ""
        raise ValueError(f"Download redirects are not allowed for {url}{detail}")


def download_file(
    url: str,
    http_client: HttpClient | None = None,
    cache_dir: Path | None = None,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
    allow_not_modified: bool = True,
    extra_allowed_hosts: Collection[str] | None = None,
) -> DownloadResult:
    url = validate_download_url(url, extra_allowed_hosts=extra_allowed_hosts)
    client = http_client or get_default_http_client()
    raw_dir = cache_dir or get_raw_cache_dir()
    raw_dir.mkdir(parents=True, exist_ok=True)

    file_name = _cache_file_name_from_url(url)
    target_path = raw_dir / file_name
    resolved_target = target_path.resolve()
    resolved_dir = raw_dir.resolve()
    if not str(resolved_target).startswith(str(resolved_dir) + "/") and resolved_target != resolved_dir:
        raise ValueError(f"Resolved path {resolved_target} escapes cache directory {resolved_dir}")
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

    response = client.get(
        url,
        stream=True,
        headers=request_headers,
        allow_redirects=False,
    )
    response_close = getattr(response, "close", None)
    did_close = False

    def close_response() -> None:
        nonlocal did_close
        if not did_close and response_close is not None:
            response_close()
            did_close = True

    try:
        response_url = str(getattr(response, "url", url) or url)
        validate_download_url(response_url, extra_allowed_hosts=extra_allowed_hosts)
        _validate_response_peer(response, response_url)
        _reject_redirect_response(response, url)
        if response.status_code == 304:
            if target_path.exists():
                response_etag = response.headers.get("ETag") or etag
                response_last_modified = response.headers.get("Last-Modified") or last_modified
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
                raise RuntimeError(f"Received 304 for {url} but cached file is missing")
            close_response()
            return download_file(
                url,
                http_client=http_client,
                cache_dir=cache_dir,
                etag=None,
                last_modified=None,
                allow_not_modified=False,
                extra_allowed_hosts=extra_allowed_hosts,
            )

        response.raise_for_status()
        max_bytes = _max_download_bytes()
        if _content_length_exceeds_limit(response, max_bytes):
            raise ValueError(f"Download exceeded maximum size of {max_bytes} bytes")
        response_etag = response.headers.get("ETag")
        response_last_modified = response.headers.get("Last-Modified")

        temp_path = target_path.with_suffix(target_path.suffix + ".part")
        try:
            with temp_path.open("wb") as handle:
                sha256, size = _sha256_stream(
                    handle.write,
                    response.iter_content(chunk_size=1024 * 1024),
                    max_bytes=max_bytes,
                )
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise

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
    finally:
        close_response()


def probe_remote(
    url: str,
    http_client: HttpClient | None = None,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
    extra_allowed_hosts: Collection[str] | None = None,
) -> ProbeResult | None:
    if not (etag or last_modified):
        return None
    url = validate_download_url(url, extra_allowed_hosts=extra_allowed_hosts)
    client = http_client or get_default_http_client()
    request_headers: dict[str, str] = {}
    if etag:
        request_headers["If-None-Match"] = etag
    if last_modified:
        request_headers["If-Modified-Since"] = last_modified

    response = client.head(url, headers=request_headers, allow_redirects=False, stream=True)
    response_close = getattr(response, "close", None)
    try:
        response_url = str(getattr(response, "url", url) or url)
        validate_download_url(response_url, extra_allowed_hosts=extra_allowed_hosts)
        _validate_response_peer(response, response_url)
        _reject_redirect_response(response, url)
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
        # Some origins restrict HEAD even when GET works (e.g. auth/CDN rules).
        # Treat these as inconclusive so callers can fall back to GET.
        if response.status_code in {401, 403}:
            return None
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
