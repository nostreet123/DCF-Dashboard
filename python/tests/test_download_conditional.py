from __future__ import annotations

import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
import requests

from damodaran_sync import download


class DummyResponse:
    def __init__(
        self,
        status_code: int,
        body: bytes = b"",
        headers: dict[str, str] | None = None,
        url: str | None = None,
        peer_ip: str | None = None,
    ) -> None:
        self.status_code = status_code
        self._body = body
        self.headers = headers or {}
        self.url = url
        self.closed = False
        self.raw = DummyRaw(peer_ip) if peer_ip is not None else None

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(response=self)

    def iter_content(self, chunk_size: int = 1024 * 1024):
        if self._body:
            yield self._body

    def close(self) -> None:
        self.closed = True


class DummySocket:
    def __init__(self, peer_ip: str) -> None:
        self._peer_ip = peer_ip

    def getpeername(self) -> tuple[str, int]:
        return (self._peer_ip, 443)


class DummyRaw:
    def __init__(self, peer_ip: str) -> None:
        self.connection = type("DummyConnection", (), {"sock": DummySocket(peer_ip)})()


class DummyClient:
    def __init__(self, responses: list[DummyResponse]) -> None:
        self._responses = list(responses)
        self.calls: list[dict[str, object]] = []

    def _request(self, method: str, url: str, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        if not self._responses:
            raise AssertionError("No more responses configured")
        return self._responses.pop(0)

    def get(self, url: str, **kwargs):
        return self._request("get", url, **kwargs)

    def head(self, url: str, **kwargs):
        return self._request("head", url, **kwargs)


class DummyRateLimiter:
    def __init__(self) -> None:
        self.calls = 0
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            self.calls += 1


def _etag(headers: dict[str, str] | None) -> dict[str, str]:
    return headers or {}


def _safe_example_resolution(*args, **kwargs):
    return [
        (
            download.socket.AF_INET,
            download.socket.SOCK_STREAM,
            6,
            "",
            ("93.184.216.34", 443),
        )
    ]


def _private_example_resolution(*args, **kwargs):
    return [
        (
            download.socket.AF_INET,
            download.socket.SOCK_STREAM,
            6,
            "",
            ("169.254.169.254", 443),
        )
    ]


@pytest.fixture(autouse=True)
def _allow_example_download_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DAMODARAN_ALLOWED_ASSET_HOSTS", "example.com")


def test_conditional_get_304_uses_cache(tmp_path) -> None:
    url = "https://example.com/test.xls"
    cached_path = tmp_path / download._cache_file_name_from_url(url)
    cached_path.write_bytes(b"cached")

    response = DummyResponse(
        304,
        headers={"ETag": "etag-1", "Last-Modified": "Mon, 12 Jan 2026 13:41:41 GMT"},
    )
    client = DummyClient([response])

    result = download.download_file(
        url,
        http_client=client,
        cache_dir=tmp_path,
        etag="etag-1",
        last_modified="Mon, 12 Jan 2026 13:41:41 GMT",
    )

    assert result.not_modified is True
    assert result.from_cache is True
    assert result.path == cached_path
    assert result.sha256 == hashlib.sha256(b"cached").hexdigest()
    assert result.etag == "etag-1"
    assert result.last_modified == "Mon, 12 Jan 2026 13:41:41 GMT"
    assert response.closed is True

    headers = _etag(client.calls[0]["kwargs"].get("headers"))
    assert headers["If-None-Match"] == "etag-1"
    assert headers["If-Modified-Since"] == "Mon, 12 Jan 2026 13:41:41 GMT"


def test_existing_basename_cache_file_is_not_reused_for_different_url(tmp_path) -> None:
    url = "https://example.com/test.xls"
    poisoned_basename = tmp_path / "test.xls"
    poisoned_basename.write_bytes(b"poisoned")
    response = DummyResponse(200, body=b"fresh")
    client = DummyClient([response])

    result = download.download_file(url, http_client=client, cache_dir=tmp_path)

    assert result.from_cache is False
    assert result.path != poisoned_basename
    assert result.path.read_bytes() == b"fresh"
    assert response.closed is True


def test_download_rejects_redirect_to_unallowed_host(tmp_path) -> None:
    response = DummyResponse(
        200,
        body=b"fresh",
        url="https://metadata.google.internal/latest.xls",
    )
    client = DummyClient([response])

    with pytest.raises(ValueError, match="not allowed"):
        download.download_file(
            "https://example.com/test.xls",
            http_client=client,
            cache_dir=tmp_path,
        )

    assert response.closed is True


def test_download_disables_redirects_before_validation(tmp_path) -> None:
    response = DummyResponse(
        302,
        headers={"Location": "https://metadata.google.internal/latest.xls"},
    )
    client = DummyClient([response])

    with pytest.raises(ValueError, match="redirects are not allowed"):
        download.download_file(
            "https://example.com/test.xls",
            http_client=client,
            cache_dir=tmp_path,
        )

    assert client.calls[0]["kwargs"]["allow_redirects"] is False
    assert response.closed is True


def test_conditional_get_304_missing_cache_retries(tmp_path) -> None:
    url = "https://example.com/missing.xls"

    response_304 = DummyResponse(
        304,
        headers={"ETag": "etag-1", "Last-Modified": "Mon, 12 Jan 2026 13:41:41 GMT"},
    )
    response_200 = DummyResponse(200, body=b"fresh", headers={"ETag": "etag-2"})
    client = DummyClient([response_304, response_200])

    result = download.download_file(
        url,
        http_client=client,
        cache_dir=tmp_path,
        etag="etag-1",
        last_modified="Mon, 12 Jan 2026 13:41:41 GMT",
    )

    assert result.not_modified is False
    assert result.from_cache is False
    assert result.path.exists()
    assert result.path.read_bytes() == b"fresh"
    assert result.etag == "etag-2"
    assert result.last_modified is None
    assert response_304.closed is True

    first_headers = _etag(client.calls[0]["kwargs"].get("headers"))
    second_headers = _etag(client.calls[1]["kwargs"].get("headers"))
    assert "If-None-Match" in first_headers
    assert "If-Modified-Since" in first_headers
    assert "If-None-Match" not in second_headers
    assert "If-Modified-Since" not in second_headers


def test_conditional_get_200_captures_headers(tmp_path) -> None:
    url = "https://example.com/fresh.xls"

    response = DummyResponse(
        200,
        body=b"fresh",
        headers={"ETag": "etag-3", "Last-Modified": "Mon, 12 Jan 2026 13:41:41 GMT"},
    )
    client = DummyClient([response])

    result = download.download_file(url, http_client=client, cache_dir=tmp_path)

    assert result.not_modified is False
    assert result.from_cache is False
    assert result.etag == "etag-3"
    assert result.last_modified == "Mon, 12 Jan 2026 13:41:41 GMT"
    assert result.path.exists()


def test_download_rejects_unallowlisted_hosts(tmp_path) -> None:
    with pytest.raises(ValueError, match="not allowed"):
        download.download_file(
            "https://169.254.169.254/latest.xls",
            http_client=DummyClient([]),
            cache_dir=tmp_path,
        )


@pytest.mark.parametrize(
    "url",
    [
        "https://2130706433/latest.xls",
        "https://017700000001/latest.xls",
        "https://127.1/latest.xls",
    ],
)
def test_download_rejects_non_canonical_private_ipv4_hosts(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    url: str,
) -> None:
    monkeypatch.setenv("DAMODARAN_ALLOWED_ASSET_HOSTS", "2130706433,017700000001,127.1")

    with pytest.raises(ValueError, match="not allowed"):
        download.download_file(
            url,
            http_client=DummyClient([]),
            cache_dir=tmp_path,
        )


def test_download_allows_explicit_extra_mirror_host(tmp_path) -> None:
    response = DummyResponse(200, body=b"fresh")
    client = DummyClient([response])

    result = download.download_file(
        "https://mirror.example.com/latest.xls",
        http_client=client,
        cache_dir=tmp_path,
        extra_allowed_hosts={"mirror.example.com"},
    )

    assert result.path.read_bytes() == b"fresh"


def test_download_rejects_allowed_host_resolving_to_private_address(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        download.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (
                download.socket.AF_INET,
                download.socket.SOCK_STREAM,
                6,
                "",
                ("127.0.0.1", 443),
            )
        ],
    )

    with pytest.raises(ValueError, match="resolves to a disallowed address"):
        download.download_file(
            "https://example.com/private.xls",
            http_client=DummyClient([]),
            cache_dir=tmp_path,
        )


def test_download_rejects_allowed_host_resolving_to_shared_address(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        download.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (
                download.socket.AF_INET,
                download.socket.SOCK_STREAM,
                6,
                "",
                ("100.64.0.1", 443),
            )
        ],
    )

    with pytest.raises(ValueError, match="resolves to a disallowed address"):
        download.download_file(
            "https://example.com/shared.xls",
            http_client=DummyClient([]),
            cache_dir=tmp_path,
        )


def test_download_rejects_private_connection_peer_after_safe_prevalidation(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(download.socket, "getaddrinfo", _safe_example_resolution)
    response = DummyResponse(200, body=b"fresh", peer_ip="127.0.0.1")
    client = DummyClient([response])

    with pytest.raises(ValueError, match="disallowed address"):
        download.download_file(
            "https://example.com/rebind.xls",
            http_client=client,
            cache_dir=tmp_path,
        )

    assert response.closed is True


def test_download_rejects_shared_connection_peer_after_safe_prevalidation(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(download.socket, "getaddrinfo", _safe_example_resolution)
    response = DummyResponse(200, body=b"fresh", peer_ip="100.64.0.1")
    client = DummyClient([response])

    with pytest.raises(ValueError, match="disallowed address"):
        download.download_file(
            "https://example.com/rebind.xls",
            http_client=client,
            cache_dir=tmp_path,
        )

    assert response.closed is True


def test_http_client_pins_request_to_validated_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(download.socket, "getaddrinfo", _safe_example_resolution)
    captured: dict[str, object] = {}

    def fake_request(self, method: str, url: str, timeout: int, **kwargs: object) -> DummyResponse:
        captured["method"] = method
        captured["url"] = url
        captured["timeout"] = timeout
        captured["pinned_ip"] = self.adapters["https://"]._pinned_ip
        return DummyResponse(200)

    monkeypatch.setattr(download.requests.Session, "request", fake_request)

    response = download.HttpClient().get("https://example.com/pinned.xls", stream=True)

    assert response.status_code == 200
    assert captured["method"] == "GET"
    assert captured["url"] == "https://example.com/pinned.xls"
    assert captured["pinned_ip"] == "93.184.216.34"


def test_download_rejects_rebound_address_before_sending_request(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolutions = iter([_safe_example_resolution(), _private_example_resolution()])
    requests_sent = 0

    def fake_getaddrinfo(*args, **kwargs):
        return next(resolutions)

    def fake_request(self, method: str, url: str, timeout: int, **kwargs: object) -> DummyResponse:
        nonlocal requests_sent
        requests_sent += 1
        return DummyResponse(200, body=b"fresh")

    monkeypatch.setattr(download.socket, "getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(download.requests.Session, "request", fake_request)

    with pytest.raises(ValueError, match="disallowed address"):
        download.download_file("https://example.com/rebind.xls", cache_dir=tmp_path)

    assert requests_sent == 0


def test_probe_remote_rejects_allowed_host_resolving_to_link_local_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        download.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (
                download.socket.AF_INET,
                download.socket.SOCK_STREAM,
                6,
                "",
                ("169.254.169.254", 443),
            )
        ],
    )

    with pytest.raises(ValueError, match="resolves to a disallowed address"):
        download.probe_remote(
            "https://example.com/private.xls",
            http_client=DummyClient([]),
            etag="etag-1",
        )


def test_probe_remote_rejects_private_connection_peer_after_safe_prevalidation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(download.socket, "getaddrinfo", _safe_example_resolution)
    response = DummyResponse(200, headers={"ETag": "etag-2"}, peer_ip="169.254.169.254")
    client = DummyClient([response])

    with pytest.raises(ValueError, match="disallowed address"):
        download.probe_remote(
            "https://example.com/rebind.xls",
            http_client=client,
            etag="etag-1",
        )

    assert client.calls[0]["kwargs"]["stream"] is True
    assert response.closed is True


def test_download_rejects_oversized_body(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DAMODARAN_DOWNLOAD_MAX_BYTES", "4")
    response = DummyResponse(200, body=b"fresh")
    client = DummyClient([response])

    with pytest.raises(ValueError, match="maximum size"):
        download.download_file(
            "https://example.com/fresh.xls",
            http_client=client,
            cache_dir=tmp_path,
        )


def test_probe_remote_304_not_modified() -> None:
    url = "https://example.com/test.xls"
    response = DummyResponse(
        304,
        headers={"ETag": "etag-1", "Last-Modified": "Mon, 12 Jan 2026 13:41:41 GMT"},
    )
    client = DummyClient([response])

    result = download.probe_remote(
        url,
        http_client=client,
        etag="etag-1",
        last_modified="Mon, 12 Jan 2026 13:41:41 GMT",
    )

    assert result is not None
    assert result.not_modified is True
    assert result.status_code == 304
    assert result.etag == "etag-1"
    assert result.last_modified == "Mon, 12 Jan 2026 13:41:41 GMT"

    headers = _etag(client.calls[0]["kwargs"].get("headers"))
    assert headers["If-None-Match"] == "etag-1"
    assert headers["If-Modified-Since"] == "Mon, 12 Jan 2026 13:41:41 GMT"


def test_probe_remote_rejects_redirect_to_unallowed_host() -> None:
    response = DummyResponse(
        200,
        headers={"ETag": "etag-2"},
        url="https://metadata.google.internal/latest.xls",
    )
    client = DummyClient([response])

    with pytest.raises(ValueError, match="not allowed"):
        download.probe_remote(
            "https://example.com/test.xls",
            http_client=client,
            etag="etag-1",
        )

    assert response.closed is True


def test_probe_remote_disables_redirects_before_validation() -> None:
    response = DummyResponse(
        302,
        headers={"Location": "https://metadata.google.internal/latest.xls"},
    )
    client = DummyClient([response])

    with pytest.raises(ValueError, match="redirects are not allowed"):
        download.probe_remote(
            "https://example.com/test.xls",
            http_client=client,
            etag="etag-1",
        )

    assert client.calls[0]["kwargs"]["allow_redirects"] is False
    assert response.closed is True


def test_probe_remote_404_not_found() -> None:
    url = "https://example.com/missing.xls"
    response = DummyResponse(404)
    client = DummyClient([response])

    result = download.probe_remote(
        url,
        http_client=client,
        etag="etag-1",
        last_modified="Mon, 12 Jan 2026 13:41:41 GMT",
    )

    assert result is not None
    assert result.not_modified is False
    assert result.status_code == 404
    assert result.etag is None
    assert result.last_modified is None


def test_probe_remote_405_returns_none() -> None:
    url = "https://example.com/nohead.xls"
    response = DummyResponse(405)
    client = DummyClient([response])

    result = download.probe_remote(
        url,
        http_client=client,
        etag="etag-1",
    )

    assert result is None


def test_probe_remote_403_returns_none() -> None:
    url = "https://example.com/forbidden.xls"
    response = DummyResponse(403)
    client = DummyClient([response])

    result = download.probe_remote(
        url,
        http_client=client,
        etag="etag-1",
    )

    assert result is None


def test_probe_remote_200_captures_headers() -> None:
    url = "https://example.com/fresh.xls"
    response = DummyResponse(
        200,
        headers={"ETag": "etag-2", "Last-Modified": "Mon, 12 Jan 2026 13:41:41 GMT"},
    )
    client = DummyClient([response])

    result = download.probe_remote(
        url,
        http_client=client,
        etag="etag-1",
    )

    assert result is not None
    assert result.not_modified is False
    assert result.status_code == 200
    assert result.etag == "etag-2"
    assert result.last_modified == "Mon, 12 Jan 2026 13:41:41 GMT"


def test_probe_remote_no_conditions_returns_none() -> None:
    client = DummyClient([])

    result = download.probe_remote(
        "https://example.com/skip.xls",
        http_client=client,
    )

    assert result is None
    assert len(client.calls) == 0


def test_probe_remote_rate_limiter_threadsafe() -> None:
    rate_limiter = DummyRateLimiter()

    class DummySession:
        def __init__(self, responses: list[DummyResponse]) -> None:
            self._responses = list(responses)

        def head(self, url: str, timeout: int, **kwargs):
            if not self._responses:
                raise AssertionError("No more responses configured")
            return self._responses.pop(0)

    thread_count = 5
    session = DummySession(
        [
            DummyResponse(
                200,
                headers={
                    "ETag": "etag-1",
                    "Last-Modified": "Mon, 12 Jan 2026 13:41:41 GMT",
                },
            )
            for _ in range(thread_count)
        ]
    )
    client = download.HttpClient(session=session, rate_limiter=rate_limiter)

    def _probe() -> download.ProbeResult | None:
        return download.probe_remote(
            "https://example.com/threaded.xls",
            http_client=client,
            etag="etag-1",
        )

    with ThreadPoolExecutor(max_workers=thread_count) as executor:
        results = list(executor.map(lambda _: _probe(), range(thread_count)))

    assert all(result is not None for result in results)
    assert rate_limiter.calls == thread_count


def test_file_name_from_url_trailing_slash_raises(tmp_path) -> None:
    """URL with no filename component (trailing slash) must raise ValueError."""
    with pytest.raises(ValueError, match="safe filename"):
        download.download_file(
            "https://example.com/",
            http_client=DummyClient([]),
            cache_dir=tmp_path,
        )


def test_file_name_from_url_dot_raises(tmp_path) -> None:
    """URL whose path resolves to '.' must raise ValueError."""
    with pytest.raises(ValueError, match="safe filename"):
        download.download_file(
            "https://example.com/.",
            http_client=DummyClient([]),
            cache_dir=tmp_path,
        )


def test_file_name_from_url_dotdot_raises(tmp_path) -> None:
    """URL whose path resolves to '..' must raise ValueError."""
    with pytest.raises(ValueError, match="safe filename"):
        download.download_file(
            "https://example.com/..",
            http_client=DummyClient([]),
            cache_dir=tmp_path,
        )
