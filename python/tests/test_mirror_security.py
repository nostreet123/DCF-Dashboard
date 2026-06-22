from __future__ import annotations

import pytest

from damodaran_sync import download
from damodaran_sync.mirror import _parse_manifest_payload, fetch_manifest


class DummyManifestResponse:
    def __init__(
        self,
        status_code: int,
        body: bytes = b"{}",
        headers: dict[str, str] | None = None,
        peer_ip: str | None = None,
    ) -> None:
        self.status_code = status_code
        self._body = body
        self.headers = headers or {}
        self.closed = False
        self.raw = DummyRaw(peer_ip) if peer_ip is not None else None

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def iter_content(self, chunk_size: int = 1024 * 1024):
        yield self._body

    def close(self) -> None:
        self.closed = True


class DummyManifestClient:
    def __init__(self, response: DummyManifestResponse) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def get(self, url: str, **kwargs: object) -> DummyManifestResponse:
        self.calls.append({"url": url, "kwargs": kwargs})
        return self.response


class DummySocket:
    def __init__(self, peer_ip: str) -> None:
        self._peer_ip = peer_ip

    def getpeername(self) -> tuple[str, int]:
        return (self._peer_ip, 443)


class DummyRaw:
    def __init__(self, peer_ip: str) -> None:
        self.connection = type("DummyConnection", (), {"sock": DummySocket(peer_ip)})()


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
def _safe_default_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(download.socket, "getaddrinfo", _safe_example_resolution)


def test_mirror_manifest_rejects_unallowlisted_asset_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DAMODARAN_ALLOWED_ASSET_HOSTS", "mirror.example.com")
    payload = {
        "assets": [
            {
                "pageType": "current",
                "downloadUrl": "https://metadata.google.internal/latest.xls",
            }
        ]
    }

    with pytest.raises(ValueError, match="not allowed"):
        _parse_manifest_payload(payload, "https://mirror.example.com/manifest.json", "current")


def test_mirror_manifest_allows_relative_asset_on_mirror_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DAMODARAN_ALLOWED_ASSET_HOSTS", "pages.stern.nyu.edu")
    payload = {
        "assets": [
            {
                "pageType": "current",
                "downloadUrl": "/assets/latest.xls",
            }
        ]
    }

    assets = _parse_manifest_payload(payload, "https://mirror.example.com/manifest.json", "current")

    assert len(assets) == 1
    assert assets[0].source_url == "https://mirror.example.com/assets/latest.xls"
    assert assets[0].allowed_host_hints == ("mirror.example.com",)


def test_mirror_manifest_preserves_mirror_host_hint_with_original_source_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DAMODARAN_ALLOWED_ASSET_HOSTS", "pages.stern.nyu.edu")
    payload = {
        "sourcePageUrl": "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/data.html",
        "assets": [
            {
                "pageType": "current",
                "downloadUrl": "/assets/latest.xls",
            }
        ],
    }

    assets = _parse_manifest_payload(payload, "https://mirror.example.com/manifest.json", "current")

    assert assets[0].source_page_url == "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/data.html"
    assert assets[0].source_url == "https://mirror.example.com/assets/latest.xls"
    assert assets[0].allowed_host_hints == ("mirror.example.com",)


def test_mirror_manifest_skips_entries_without_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DAMODARAN_ALLOWED_ASSET_HOSTS", "mirror.example.com")
    payload = {
        "assets": [
            {
                "pageType": "current",
                "fileName": "empty.xls",
            }
        ]
    }

    assets = _parse_manifest_payload(payload, "https://mirror.example.com/manifest.json", "current")

    assert assets == []


def test_fetch_manifest_rejects_unsafe_manifest_url() -> None:
    with pytest.raises(ValueError, match="not allowed"):
        fetch_manifest("https://169.254.169.254/latest/meta-data", "current")


def test_fetch_manifest_rejects_non_canonical_private_ipv4_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DAMODARAN_ALLOWED_ASSET_HOSTS", "2130706433")
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

    with pytest.raises(ValueError, match="not allowed"):
        fetch_manifest("https://2130706433/latest/meta-data", "current")


def test_fetch_manifest_rejects_unresolved_manifest_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_getaddrinfo(*args, **kwargs):
        raise download.socket.gaierror()

    monkeypatch.setattr(download.socket, "getaddrinfo", fake_getaddrinfo)

    with pytest.raises(ValueError, match="could not be resolved"):
        fetch_manifest("https://mirror.example.com/manifest.json", "current")


def test_fetch_manifest_disables_redirects(monkeypatch: pytest.MonkeyPatch) -> None:
    response = DummyManifestResponse(302, headers={"Location": "https://metadata.google.internal/latest"})
    client = DummyManifestClient(response)

    with pytest.raises(ValueError, match="redirects are not allowed"):
        fetch_manifest("https://mirror.example.com/manifest.json", "current", http_client=client)

    assert client.calls[0]["kwargs"]["allow_redirects"] is False
    assert response.closed is True


def test_fetch_manifest_rejects_private_connection_peer_after_safe_prevalidation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(download.socket, "getaddrinfo", _safe_example_resolution)
    response = DummyManifestResponse(200, body=b'{"assets":[]}', peer_ip="169.254.169.254")
    client = DummyManifestClient(response)

    with pytest.raises(ValueError, match="disallowed address"):
        fetch_manifest("https://mirror.example.com/manifest.json", "current", http_client=client)

    assert client.calls[0]["kwargs"]["stream"] is True
    assert response.closed is True


def test_fetch_manifest_rejects_shared_connection_peer_after_safe_prevalidation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(download.socket, "getaddrinfo", _safe_example_resolution)
    response = DummyManifestResponse(200, body=b'{"assets":[]}', peer_ip="100.64.0.1")
    client = DummyManifestClient(response)

    with pytest.raises(ValueError, match="disallowed address"):
        fetch_manifest("https://mirror.example.com/manifest.json", "current", http_client=client)

    assert client.calls[0]["kwargs"]["stream"] is True
    assert response.closed is True


def test_fetch_manifest_rejects_rebound_address_before_sending_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolutions = iter([_safe_example_resolution(), _private_example_resolution()])
    requests_sent = 0

    def fake_getaddrinfo(*args, **kwargs):
        return next(resolutions)

    def fake_request(self, method: str, url: str, timeout: int, **kwargs: object) -> DummyManifestResponse:
        nonlocal requests_sent
        requests_sent += 1
        return DummyManifestResponse(200, body=b'{"assets":[]}')

    monkeypatch.setattr(download.socket, "getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(download.requests.Session, "request", fake_request)

    with pytest.raises(ValueError, match="disallowed address"):
        fetch_manifest("https://mirror.example.com/manifest.json", "current")

    assert requests_sent == 0
