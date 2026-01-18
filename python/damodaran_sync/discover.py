from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Iterable
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup

from damodaran_sync.date_parser import ParsedDate, infer_date_from_filename, parse_link_label_as_of_date
from damodaran_sync.download import HttpClient, get_default_http_client

CURRENT_PAGE_URL = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html"
ARCHIVE_PAGE_URL = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/dataarchived.html"

SUPPORTED_EXTENSIONS = {".xls", ".xlsx"}
IGNORED_EXTENSIONS = {".xlsm", ".csv", ".zip"}


@dataclass(frozen=True)
class Asset:
    url: str
    name: str
    label: str


@dataclass(frozen=True)
class DiscoveredAsset:
    source_page_url: str
    page_type: str
    page_last_updated: str | None
    source_url: str
    file_name: str
    link_label: str
    as_of_date: str | None
    as_of_date_source: str | None
    as_of_granularity: str | None
    resolution_error: str | None


@dataclass(frozen=True)
class PageDiscovery:
    page_url: str
    page_type: str
    page_last_updated: str | None
    assets: list[DiscoveredAsset]


def _normalize_label(text: str) -> str:
    return " ".join(text.strip().split())


def _extract_file_name(url: str) -> str:
    path = urlparse(url).path
    return unquote(Path(path).name)


def _is_supported_excel(url: str) -> bool:
    path = urlparse(url).path
    ext = Path(path).suffix.lower()
    if ext in IGNORED_EXTENSIONS:
        return False
    return ext in SUPPORTED_EXTENSIONS


def extract_page_last_full_update(soup: BeautifulSoup) -> ParsedDate | None:
    text = soup.get_text(" ", strip=True)
    match = re.search(
        r"Data of last full update:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    return parse_link_label_as_of_date(match.group(1))


def _resolve_as_of_date(
    *,
    page_type: str,
    page_last_updated: ParsedDate | None,
    link_label: str,
    file_name: str,
) -> tuple[str | None, str | None, str | None, str | None]:
    parsed_label = parse_link_label_as_of_date(link_label)
    if parsed_label:
        return (
            parsed_label.value.isoformat(),
            "label",
            parsed_label.granularity,
            None,
        )

    if page_type == "current" and page_last_updated:
        return (
            page_last_updated.value.isoformat(),
            "page_last_update",
            page_last_updated.granularity,
            None,
        )

    if page_type == "archive":
        inferred = infer_date_from_filename(file_name)
        if inferred:
            return (
                inferred.value.isoformat(),
                "filename_inferred",
                inferred.granularity,
                None,
            )

    return (None, None, None, "unparseable_date")


def _extract_links(soup: BeautifulSoup) -> Iterable[tuple[str, str]]:
    for tag in soup.find_all("a"):
        href = tag.get("href")
        if not href:
            continue
        label = _normalize_label(tag.get_text(" ", strip=True))
        yield href, label


def discover_page_assets(
    page_url: str,
    page_type: str,
    session: requests.Session | None = None,
    http_client: HttpClient | None = None,
) -> PageDiscovery:
    if page_type not in {"current", "archive"}:
        raise ValueError("page_type must be 'current' or 'archive'")

    client = http_client or (HttpClient(session=session) if session else get_default_http_client())
    response = client.get(page_url)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "lxml")

    page_last_updated = extract_page_last_full_update(soup)

    assets: list[DiscoveredAsset] = []
    for href, label in _extract_links(soup):
        absolute = urljoin(page_url, href)
        if not _is_supported_excel(absolute):
            continue
        file_name = _extract_file_name(absolute)
        as_of_date, as_of_source, as_of_granularity, error = _resolve_as_of_date(
            page_type=page_type,
            page_last_updated=page_last_updated,
            link_label=label,
            file_name=file_name,
        )
        assets.append(
            DiscoveredAsset(
                source_page_url=page_url,
                page_type=page_type,
                page_last_updated=page_last_updated.value.isoformat()
                if page_last_updated
                else None,
                source_url=absolute,
                file_name=file_name,
                link_label=label,
                as_of_date=as_of_date,
                as_of_date_source=as_of_source,
                as_of_granularity=as_of_granularity,
                resolution_error=error,
            )
        )

    return PageDiscovery(
        page_url=page_url,
        page_type=page_type,
        page_last_updated=page_last_updated.value.isoformat()
        if page_last_updated
        else None,
        assets=assets,
    )


def discover_current_and_archive(
    http_client: HttpClient | None = None,
) -> tuple[PageDiscovery, PageDiscovery]:
    client = http_client or get_default_http_client()
    current = discover_page_assets(CURRENT_PAGE_URL, "current", http_client=client)
    archive = discover_page_assets(ARCHIVE_PAGE_URL, "archive", http_client=client)
    return current, archive
