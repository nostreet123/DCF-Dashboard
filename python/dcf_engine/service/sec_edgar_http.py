from __future__ import annotations

import os
from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_COMPANY_TICKERS_EXCHANGE_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
SEC_COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVE_DOCUMENT_URL = "https://www.sec.gov/Archives/edgar/data/{cik_unpadded}/{accession_no_dashes}/{document}"


class TransientHttpError(RuntimeError):
    def __init__(self, status_code: int, url: str) -> None:
        super().__init__(f"Transient HTTP error {status_code} for {url}")
        self.status_code = status_code
        self.url = url


def sec_headers() -> dict[str, str]:
    user_agent = os.getenv("SEC_USER_AGENT")
    if not user_agent:
        raise RuntimeError("SEC_USER_AGENT environment variable is required")
    return {
        "User-Agent": user_agent,
        "Accept-Encoding": "gzip, deflate",
        "Accept": "application/json",
    }


@retry(
    retry=retry_if_exception_type((requests.RequestException, TransientHttpError)),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    stop=stop_after_attempt(5),
    reraise=True,
)
def get_json(url: str) -> dict[str, Any]:
    response = requests.get(url, headers=sec_headers(), timeout=30)
    if response.status_code == 429 or response.status_code >= 500:
        raise TransientHttpError(response.status_code, url)
    response.raise_for_status()
    return response.json()


@retry(
    retry=retry_if_exception_type((requests.RequestException, TransientHttpError)),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    stop=stop_after_attempt(5),
    reraise=True,
)
def get_text(url: str) -> str:
    response = requests.get(url, headers=sec_headers(), timeout=30)
    if response.status_code == 429 or response.status_code >= 500:
        raise TransientHttpError(response.status_code, url)
    response.raise_for_status()
    return response.text
