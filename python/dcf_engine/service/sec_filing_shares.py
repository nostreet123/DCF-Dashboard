from __future__ import annotations

import html
import re
from typing import Any

from dcf_engine.service.sec_edgar_http import (
    SEC_ARCHIVE_DOCUMENT_URL,
    SEC_SUBMISSIONS_URL,
    get_json,
    get_text,
)

_SHARES_TAG_RE = re.compile(
    r'<ix:nonfraction\b[^>]*name="dei:EntityCommonStockSharesOutstanding"[^>]*>(.*?)</ix:nonfraction>',
    re.IGNORECASE | re.DOTALL,
)
_ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_BRK_B_TO_A_RATIO = 1500


def _parse_number(value: str) -> float | None:
    cleaned = html.unescape(value)
    cleaned = _TAG_RE.sub("", cleaned).replace(",", "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_berkshire_share_counts(document_html: str) -> tuple[float, float] | None:
    marker = "indicate the number of shares outstanding"
    marker_index = document_html.lower().find(marker)
    if marker_index < 0:
        return None

    section = document_html[marker_index:]
    table_end = section.lower().find("</table>")
    if table_end >= 0:
        section = section[: table_end + len("</table>")]

    class_a: float | None = None
    class_b: float | None = None
    for row in _ROW_RE.findall(section):
        values = _SHARES_TAG_RE.findall(row)
        if not values:
            continue

        row_text = html.unescape(_TAG_RE.sub(" ", row))
        row_text = " ".join(row_text.split()).casefold()
        value = _parse_number(values[-1])
        if value is None:
            continue

        if "class a common stock" in row_text:
            class_a = value
        elif "class b common stock" in row_text:
            class_b = value

    if class_a is None or class_b is None:
        return None
    return class_a, class_b


def extract_berkshire_equivalent_class_a_shares(document_html: str) -> float | None:
    share_counts = extract_berkshire_share_counts(document_html)
    if share_counts is None:
        return None

    class_a, class_b = share_counts
    return class_a + (class_b / _BRK_B_TO_A_RATIO)


def _latest_10k_document(submissions: dict[str, Any]) -> tuple[str, str] | None:
    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    documents = recent.get("primaryDocument", [])
    for form, accession, document in zip(forms, accessions, documents, strict=False):
        if form == "10-K" and accession and document:
            return str(accession), str(document)
    return None


def fetch_berkshire_equivalent_class_a_shares(cik: str) -> float | None:
    submissions = get_json(SEC_SUBMISSIONS_URL.format(cik=cik))
    filing = _latest_10k_document(submissions)
    if filing is None:
        return None

    accession, document = filing
    document_url = SEC_ARCHIVE_DOCUMENT_URL.format(
        cik_unpadded=str(int(cik)),
        accession_no_dashes=accession.replace("-", ""),
        document=document,
    )
    return extract_berkshire_equivalent_class_a_shares(get_text(document_url))
