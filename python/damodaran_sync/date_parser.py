from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

_MONTH_MAP: dict[str, int] = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


@dataclass(frozen=True)
class ParsedDate:
    value: date
    granularity: str  # "day" | "month"


def _two_digit_year(year2: int) -> int:
    return 2000 + year2 if year2 < 50 else 1900 + year2


def parse_link_label_as_of_date(label: str) -> ParsedDate | None:
    if not label:
        return None

    normalized = " ".join(label.strip().lower().split())

    match = re.match(r"^(\d{1,2})/(\d{2})$", normalized)
    if match:
        month = int(match.group(1))
        year2 = int(match.group(2))
        year = _two_digit_year(year2)
        try:
            return ParsedDate(date(year, month, 1), "month")
        except ValueError:
            return None

    match = re.match(r"^([a-z]+)\s+(\d{4})$", normalized)
    if match:
        month = _MONTH_MAP.get(match.group(1))
        if month is None:
            return None
        year = int(match.group(2))
        try:
            return ParsedDate(date(year, month, 1), "month")
        except ValueError:
            return None

    match = re.match(r"^([a-z]+)\s+(\d{1,2}),?\s*(\d{4})", normalized)
    if match:
        month = _MONTH_MAP.get(match.group(1))
        if month is None:
            return None
        day = int(match.group(2))
        year = int(match.group(3))
        try:
            return ParsedDate(date(year, month, day), "day")
        except ValueError:
            return None

    return None


def infer_date_from_filename(filename: str) -> ParsedDate | None:
    stem = Path(filename).stem.lower()
    candidates: list[ParsedDate] = []

    month_pattern = re.compile(
        r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[-_ ]?(\d{2}|\d{4})"
    )
    for match in month_pattern.finditer(stem):
        month = _MONTH_MAP.get(match.group(1))
        if month is None:
            continue
        year_raw = match.group(2)
        year = int(year_raw) if len(year_raw) == 4 else _two_digit_year(int(year_raw))
        try:
            candidates.append(ParsedDate(date(year, month, 1), "month"))
        except ValueError:
            continue

    numeric_pattern = re.compile(
        r"(\d{4})[-_ ]?(0[1-9]|1[0-2])(?:[-_ ]?(0[1-9]|[12]\d|3[01]))?"
    )
    current_year = date.today().year
    min_year = 1900
    for match in numeric_pattern.finditer(stem):
        year = int(match.group(1))
        if year < min_year or year > current_year:
            continue
        month = int(match.group(2))
        day_raw = match.group(3)
        day = int(day_raw) if day_raw else 1
        granularity = "day" if day_raw else "month"
        try:
            candidates.append(ParsedDate(date(year, month, day), granularity))
        except ValueError:
            continue

    if not candidates:
        return None

    unique: dict[tuple[int, int, int, str], ParsedDate] = {}
    for candidate in candidates:
        key = (candidate.value.year, candidate.value.month, candidate.value.day, candidate.granularity)
        unique[key] = candidate

    if len(unique) != 1:
        return None

    return next(iter(unique.values()))
