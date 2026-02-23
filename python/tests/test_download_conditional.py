from __future__ import annotations

import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
import requests

from damodaran_sync import download


class DummyResponse:
    def __init__(self, status_code: int, body: bytes = b"", headers: dict[str, str] | None = None) -> None:
        self.status_code = status_code
        self._body = body
        self.headers = headers or {}
        self.closed = False

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(response=self)

    def iter_content(self, chunk_size: int = 1024 * 1024):
        if self._body:
            yield self._body

    def close(self) -> None:
        self.closed = True


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


def test_conditional_get_304_uses_cache(tmp_path) -> None:
    url = "https://example.com/test.xls"
    cached_path = tmp_path / "test.xls"
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
