from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event, Lock

import pytest

from dcf_engine.service import sec_edgar, sec_edgar_cache
from dcf_engine.service.sec_edgar_cache import (
    CACHE_TTL_SECONDS,
    load_company_tickers as load_company_tickers_cached,
    ticker_cache_path,
)
from dcf_engine.service.sec_edgar_extract import (
    build_statements,
    combine_values,
    extract_annual_values,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "sec_edgar"


def _load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def test_cache_hit_uses_cached_payload_without_fetch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    payload = _load_fixture("company_tickers.json")
    cache_path = ticker_cache_path()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload), encoding="utf-8")

    called = {"count": 0}

    def fake_fetch(_: str) -> dict[str, Any]:
        called["count"] += 1
        return payload

    entries = load_company_tickers_cached(fake_fetch, "https://example.test/tickers")

    assert called["count"] == 0
    assert len(entries) == 3
    assert entries[0]["ticker"] == "AAPL"


def test_cache_miss_fetches_and_writes_cache(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    payload = _load_fixture("company_tickers.json")
    called = {"count": 0}

    def fake_fetch(_: str) -> dict[str, Any]:
        called["count"] += 1
        return payload

    entries = load_company_tickers_cached(fake_fetch, "https://example.test/tickers")

    assert called["count"] == 1
    assert len(entries) == 3
    assert ticker_cache_path().exists()
    written = json.loads(ticker_cache_path().read_text(encoding="utf-8"))
    assert written == payload


def test_cache_parses_exchange_directory_payload(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    payload = _load_fixture("company_tickers_exchange.json")

    entries = load_company_tickers_cached(
        lambda _: payload,
        "https://example.test/tickers-exchange",
    )

    assert entries[0]["ticker"] == "AAPL"
    assert entries[0]["name"] == "Apple Inc."
    assert entries[0]["exchange"] == "Nasdaq"


def test_stale_cache_fetches_fresh_payload(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    stale_payload = {"0": {"cik_str": 1, "ticker": "OLD", "title": "Old Inc."}}
    fresh_payload = _load_fixture("company_tickers.json")

    cache_path = ticker_cache_path()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(stale_payload), encoding="utf-8")
    old_timestamp = time.time() - CACHE_TTL_SECONDS - 5
    os.utime(cache_path, (old_timestamp, old_timestamp))

    called = {"count": 0}

    def fake_fetch(_: str) -> dict[str, Any]:
        called["count"] += 1
        return fresh_payload

    entries = load_company_tickers_cached(fake_fetch, "https://example.test/tickers")

    assert called["count"] == 1
    assert entries[0]["ticker"] == "AAPL"


def test_invalid_cache_payload_fetches_fresh_payload(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    ticker_cache_path().parent.mkdir(parents=True, exist_ok=True)
    ticker_cache_path().write_text("[1, 2, 3]", encoding="utf-8")

    fresh_payload = _load_fixture("company_tickers.json")
    called = {"count": 0}

    def fake_fetch(_: str) -> dict[str, Any]:
        called["count"] += 1
        return fresh_payload

    entries = load_company_tickers_cached(fake_fetch, "https://example.test/tickers")

    assert called["count"] == 1
    assert len(entries) == 3


def test_extract_annual_values_prefers_latest_filing() -> None:
    facts = _load_fixture("company_facts_full.json")

    revenue = extract_annual_values(facts, "Revenues", ["USD"])

    assert sorted(revenue.keys()) == [2023, 2024]
    assert revenue[2024].value == 105.0
    assert revenue[2024].filed == "2025-02-20"


def test_extract_annual_values_keys_comparatives_by_period_end_year() -> None:
    facts = {
        "facts": {
            "us-gaap": {
                "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-03-02",
                                "end": "2023-12-31",
                                "val": 38643000000,
                            },
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-03-02",
                                "end": "2025-12-31",
                                "val": 52569000000,
                            },
                        ]
                    }
                }
            }
        }
    }

    cash = extract_annual_values(
        facts,
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        ["USD"],
    )

    assert cash[2023].value == 38643000000
    assert cash[2025].value == 52569000000


def test_extract_annual_share_values_can_key_by_fiscal_year() -> None:
    facts = {
        "facts": {
            "dei": {
                "EntityCommonStockSharesOutstanding": {
                    "units": {
                        "shares": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-02-15",
                                "end": "2026-01-31",
                                "val": 1000,
                            }
                        ]
                    }
                }
            }
        }
    }

    shares = extract_annual_values(
        facts,
        "EntityCommonStockSharesOutstanding",
        ["shares"],
        prefer_fiscal_year=True,
    )

    assert shares[2025].value == 1000
    assert 2026 not in shares


def test_extract_annual_values_ignores_quarterly_durations_marked_fy() -> None:
    facts = {
        "facts": {
            "us-gaap": {
                "RevenueFromContractWithCustomerExcludingAssessedTax": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2025-10-31",
                                "start": "2024-09-29",
                                "end": "2025-09-27",
                                "val": 416161000000,
                            },
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2025-10-31",
                                "start": "2025-03-30",
                                "end": "2025-06-28",
                                "val": 94036000000,
                            },
                        ]
                    }
                }
            }
        }
    }

    revenue = extract_annual_values(
        facts,
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        ["USD"],
    )

    assert sorted(revenue.keys()) == [2025]
    assert revenue[2025].value == 416161000000
    assert revenue[2025].end == "2025-09-27"


def test_build_statements_prefers_modern_revenue_tag_for_latest_years() -> None:
    facts = {
        "facts": {
            "us-gaap": {
                "RevenueFromContractWithCustomerExcludingAssessedTax": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2025-10-31",
                                "start": "2024-09-29",
                                "end": "2025-09-27",
                                "val": 416161000000,
                            }
                        ]
                    }
                },
                "OperatingIncomeLoss": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2025-10-31",
                                "start": "2024-09-29",
                                "end": "2025-09-27",
                                "val": 133050000000,
                            }
                        ]
                    }
                },
                "Revenues": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2018,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2018-11-05",
                                "start": "2017-10-01",
                                "end": "2018-09-29",
                                "val": 265595000000,
                            }
                        ]
                    }
                },
                "CommonStockSharesOutstanding": {
                    "units": {
                        "shares": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2025-10-31",
                                "end": "2025-09-27",
                                "val": 14776384000,
                            }
                        ]
                    }
                },
            }
        }
    }

    statements = build_statements(facts, "AAPL")

    assert statements[0].period_end == "2025-09-27"
    assert statements[0].revenue == 416161000000
    assert statements[0].operating_income == 133050000000
    assert statements[0].operating_margin == pytest.approx(133050000000 / 416161000000)
    assert statements[0].shares_outstanding == 14776384000


def test_debt_combination_sums_current_and_long_term() -> None:
    facts = _load_fixture("company_facts_full.json")

    debt_current = extract_annual_values(facts, "DebtCurrent", ["USD"])
    debt_long = extract_annual_values(facts, "LongTermDebtNoncurrent", ["USD"])
    combined = combine_values(debt_current, debt_long)

    assert combined[2024].value == 50.0
    assert combined[2024].filed == "2025-02-21"


def test_build_statements_falls_back_to_partial_payload_and_unexpected_units() -> None:
    facts = _load_fixture("company_facts_partial.json")

    statements = build_statements(facts, "MSFT")

    assert len(statements) == 2
    latest = statements[0]
    assert latest.period_end == "2023-12-31"
    assert latest.revenue is None
    assert latest.cash == 12.0
    assert latest.debt == 33.0
    assert latest.shares_outstanding == 7.0


def test_build_statements_uses_weighted_average_shares_fallback() -> None:
    facts = {
        "facts": {
            "us-gaap": {
                "Revenues": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-03-02",
                                "start": "2025-01-01",
                                "end": "2025-12-31",
                                "val": 1000,
                            }
                        ]
                    }
                },
                "WeightedAverageNumberOfSharesOutstandingBasic": {
                    "units": {
                        "shares": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-03-02",
                                "start": "2025-01-01",
                                "end": "2025-12-31",
                                "val": 1438743,
                            }
                        ]
                    }
                },
            }
        }
    }

    statements = build_statements(facts, "BRK-A")

    assert statements[0].shares_outstanding == 1438743


def test_build_statements_merges_missing_cash_years_from_restricted_cash_fallback() -> None:
    facts = {
        "facts": {
            "us-gaap": {
                "Revenues": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-03-02",
                                "end": "2025-12-31",
                                "val": 371444000000,
                            }
                        ]
                    }
                },
                "CashAndCashEquivalentsAtCarryingValue": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2017,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2018-02-26",
                                "end": "2017-12-31",
                                "val": 31583000000,
                            }
                        ]
                    }
                },
                "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-03-02",
                                "end": "2025-12-31",
                                "val": 52569000000,
                            }
                        ]
                    }
                },
            }
        }
    }

    statements = build_statements(facts, "BRK-A")

    assert statements[0].cash == 52569000000


def test_search_companies_filters_results_and_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _load_fixture("company_tickers.json")
    entries = list(payload.values())
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: entries)

    results = sec_edgar.search_companies("inc", limit=2)

    assert len(results) == 2
    assert results[0].symbol == "AAPL"


def test_search_companies_returns_exchange_aware_listing_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _load_fixture("company_tickers_exchange.json")
    fields = payload["fields"]
    entries = [dict(zip(fields, row, strict=True)) for row in payload["data"]]
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: entries)

    results = sec_edgar.search_companies("AAPL", limit=5)

    assert results[0].canonical_id == "0000320193"
    assert results[0].listing_id == "XNAS:AAPL"
    assert results[0].exchange == "Nasdaq"
    assert results[0].mic == "XNAS"
    assert results[0].country_code == "US"
    assert results[0].coverage_state == "valuation_ready"


def test_search_companies_prioritizes_ticker_root_matches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        sec_edgar,
        "load_company_tickers",
        lambda: [
            {"cik_str": 1109354, "ticker": "BRKR", "title": "BRUKER CORP"},
            {"cik_str": 1067983, "ticker": "BRK-B", "title": "BERKSHIRE HATHAWAY INC"},
            {"cik_str": 1067983, "ticker": "BRK-A", "title": "BERKSHIRE HATHAWAY INC"},
        ],
    )

    results = sec_edgar.search_companies("brk", limit=3)

    assert [result.symbol for result in results] == ["BRK-A", "BRK-B", "BRKR"]


def test_fetch_company_facts_raises_for_unknown_ticker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: [])

    with pytest.raises(ValueError, match="Unknown ticker"):
        sec_edgar.fetch_company_facts("NOTREAL")


def test_fetch_company_facts_builds_company_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _load_fixture("company_tickers.json")
    facts = _load_fixture("company_facts_full.json")
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: list(payload.values()))
    monkeypatch.setattr(sec_edgar, "get_json", lambda _: facts)

    company = sec_edgar.fetch_company_facts(" aapl ")

    assert company.symbol == "AAPL"
    assert company.cik == "0000320193"
    assert company.name == "Apple Inc."
    assert company.statements[0].revenue == 105.0
    assert company.statements[0].debt == 50.0


def test_fetch_company_facts_derives_berkshire_equivalent_shares(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "0": {
            "cik_str": 1067983,
            "ticker": "BRK-A",
            "title": "BERKSHIRE HATHAWAY INC",
        }
    }
    facts = {
        "facts": {
            "us-gaap": {
                "Revenues": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "filed": "2026-03-02",
                                "end": "2025-12-31",
                                "val": 371444000000,
                            }
                        ]
                    }
                }
            }
        }
    }
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: list(payload.values()))
    monkeypatch.setattr(sec_edgar, "get_json", lambda _: facts)
    monkeypatch.setattr(
        sec_edgar,
        "fetch_berkshire_equivalent_class_a_shares",
        lambda _: 1438223.426,
    )

    company = sec_edgar.fetch_company_facts("BRK-A")

    assert company.statements[0].shares_outstanding == 1438223.426


def test_fetch_company_facts_derives_berkshire_class_b_equivalent_shares(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "0": {
            "cik_str": 1067983,
            "ticker": "BRK-B",
            "title": "BERKSHIRE HATHAWAY INC",
        }
    }
    facts = {
        "facts": {
            "us-gaap": {
                "Revenues": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "filed": "2026-03-02",
                                "end": "2025-12-31",
                                "val": 371444000000,
                            }
                        ]
                    }
                }
            }
        }
    }
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: list(payload.values()))
    monkeypatch.setattr(sec_edgar, "get_json", lambda _: facts)
    monkeypatch.setattr(
        sec_edgar,
        "fetch_berkshire_equivalent_class_a_shares",
        lambda _: 1438223.426,
    )

    company = sec_edgar.fetch_company_facts("BRK-B")

    assert company.statements[0].shares_outstanding == 1438223.426 * 1500


@pytest.fixture
def ticker_parses(monkeypatch: pytest.MonkeyPatch):
    calls = []
    original_load = json.load

    def load(handle, *args, **kwargs):
        calls.append(handle.name)
        return original_load(handle, *args, **kwargs)

    monkeypatch.setattr(sec_edgar_cache.json, "load", load)
    return calls


def test_ticker_file_is_parsed_once_for_repeated_search_and_reads(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, ticker_parses,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    payload = {
        "fields": ["cik", "name", "ticker", "exchange", "metadata"],
        "data": [
            [2, "Second listing", "DUP", "NYSE", {"tags": ["original"]}],
            [1, "First listing", "DUP", "Nasdaq", {"tags": ["original"]}],
        ],
    }
    sec_edgar_cache.write_ticker_cache("exchange", payload)
    monkeypatch.setattr(sec_edgar, "get_json", lambda _: pytest.fail("fresh cache must not fetch"))

    first = sec_edgar.load_company_tickers()
    first[0]["ticker"] = "MUTATED"
    first[0]["metadata"]["tags"].append("mutated")
    first.reverse()
    results = sec_edgar.search_companies("DUP")
    again = sec_edgar.load_company_tickers()
    sec_edgar.load_company_tickers()

    assert len(ticker_parses) == 1
    assert [result.name for result in results] == ["Second listing", "First listing"]
    assert [entry["cik"] for entry in again] == [2, 1]
    assert again[0]["metadata"] == {"tags": ["original"]}


def test_ticker_memory_hit_still_checks_ttl_each_time(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, ticker_parses,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    sec_edgar_cache.write_ticker_cache("exchange", _load_fixture("company_tickers.json"))
    now = ticker_cache_path().stat().st_mtime
    monkeypatch.setattr(sec_edgar_cache.time, "time", lambda: now)
    assert sec_edgar_cache.load_cached_tickers() is not None
    monkeypatch.setattr(sec_edgar_cache.time, "time", lambda: now + CACHE_TTL_SECONDS)
    assert sec_edgar_cache.load_cached_tickers() is not None
    monkeypatch.setattr(sec_edgar_cache.time, "time", lambda: now + CACHE_TTL_SECONDS + 1)
    assert sec_edgar_cache.load_cached_tickers() is None
    assert len(ticker_parses) == 1


def test_ticker_memory_observes_replacement_corruption_and_recovery(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, ticker_parses,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    old = {"0": {"ticker": "OLD"}}
    new = {"0": {"ticker": "NEW"}}
    sec_edgar_cache.write_ticker_cache("exchange", old)
    path = ticker_cache_path()
    assert sec_edgar_cache.load_cached_tickers() == list(old.values())
    previous = path.stat()
    replacement = tmp_path / "replacement.json"
    replacement.write_text(json.dumps(new), encoding="utf-8")
    os.utime(replacement, ns=(previous.st_atime_ns, previous.st_mtime_ns))
    replacement.replace(path)
    assert sec_edgar_cache.load_cached_tickers() == list(new.values())
    path.write_text("broken json", encoding="utf-8")
    assert sec_edgar_cache.load_cached_tickers() is None
    sec_edgar_cache.write_ticker_cache("exchange", old)
    assert sec_edgar_cache.load_cached_tickers() == list(old.values())
    path.unlink()
    assert sec_edgar_cache.load_cached_tickers() is None
    assert len(ticker_parses) == 4


def test_ticker_memory_separates_directories_and_exchange_legacy_keys(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, ticker_parses,
) -> None:
    for directory, symbol in [(tmp_path / "one", "ONE"), (tmp_path / "two", "TWO")]:
        monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(directory))
        for key in ["exchange", "legacy"]:
            payload = {"0": {"ticker": f"{symbol}-{key}"}}
            sec_edgar_cache.write_ticker_cache(key, payload)
            assert sec_edgar_cache.load_cached_tickers(key) == list(payload.values())
            assert sec_edgar_cache.load_cached_tickers(key) == list(payload.values())
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path / "one"))
    assert sec_edgar_cache.load_cached_tickers()[0]["ticker"] == "ONE-exchange"
    assert len(ticker_parses) == 4


def test_ticker_memory_bounds_retained_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, ticker_parses,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(sec_edgar_cache, "_MAX_PARSED_TICKER_FILES", 2, raising=False)
    for key in ["one", "two", "three"]:
        sec_edgar_cache.write_ticker_cache(key, {"0": {"ticker": key}})
        assert sec_edgar_cache.load_cached_tickers(key)[0]["ticker"] == key
        sec_edgar_cache.load_cached_tickers(key)
    assert len(ticker_parses) == 3
    assert sec_edgar_cache.load_cached_tickers("one")[0]["ticker"] == "one"
    assert len(ticker_parses) == 4


def test_ticker_memory_shares_one_parse_across_threads(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    sec_edgar_cache.write_ticker_cache("exchange", _load_fixture("company_tickers.json"))
    start = Barrier(5)
    parsing = Event()
    another_parse = Event()
    release = Event()
    calls_lock = Lock()
    calls = []
    original_load = json.load

    def load(handle, *args, **kwargs):
        with calls_lock:
            calls.append(handle.name)
            if len(calls) > 1:
                another_parse.set()
        parsing.set()
        assert release.wait(5), "test did not release the first parser"
        return original_load(handle, *args, **kwargs)

    def read():
        start.wait(timeout=5)
        return sec_edgar_cache.load_cached_tickers()

    monkeypatch.setattr(sec_edgar_cache.json, "load", load)
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(read) for _ in range(4)]
        try:
            start.wait(timeout=5)
            assert parsing.wait(5)
            # Keep the first miss in the parser while the other workers access
            # the same cold file. Removing synchronization triggers this event.
            assert not another_parse.wait(0.2)
        finally:
            release.set()
        entries = [future.result(timeout=5) for future in futures]
    assert all(rows[0]["ticker"] == "AAPL" for rows in entries)
    assert len(calls) == 1


def test_ticker_cold_fetch_seeds_an_owned_snapshot(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, ticker_parses,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    payload = {"0": {"ticker": "FIRST", "metadata": [{"tags": ["original"]}]}}
    first = load_company_tickers_cached(lambda _: payload, "https://example.test/tickers")
    first[0]["ticker"] = "CALLER"
    first[0]["metadata"][0]["tags"].append("caller")
    payload["0"]["metadata"][0]["tags"].append("fetcher")
    again = sec_edgar_cache.load_cached_tickers()

    assert again == [{"ticker": "FIRST", "metadata": [{"tags": ["original"]}]}]
    assert ticker_parses == []


def test_ticker_cold_snapshot_matches_serialized_bytes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    payload = {"0": {"ticker": "ORIGINAL", "metadata": {"tags": ["original"]}}}
    original_dumps = json.dumps
    original_dump = json.dump

    def mutate():
        payload["0"]["ticker"] = "CHANGED"
        payload["0"]["metadata"]["tags"].append("changed")

    def dumps(value, *args, **kwargs):
        serialized = original_dumps(value, *args, **kwargs)
        mutate()
        return serialized

    def dump(value, handle, *args, **kwargs):
        original_dump(value, handle, *args, **kwargs)
        mutate()

    monkeypatch.setattr(sec_edgar_cache.json, "dumps", dumps)
    monkeypatch.setattr(sec_edgar_cache.json, "dump", dump)
    first = load_company_tickers_cached(lambda _: payload, "https://example.test/tickers")

    assert first == [{"ticker": "ORIGINAL", "metadata": {"tags": ["original"]}}]
    assert sec_edgar_cache.load_cached_tickers() == first
    assert json.loads(ticker_cache_path().read_text()) == {
        "0": {"ticker": "ORIGINAL", "metadata": {"tags": ["original"]}}
    }


def test_ticker_slow_file_does_not_block_an_independent_cached_path(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    sec_edgar_cache.write_ticker_cache("slow", {"0": {"ticker": "SLOW"}})
    sec_edgar_cache.write_ticker_cache("fast", {"0": {"ticker": "FAST"}})
    assert sec_edgar_cache.load_cached_tickers("fast") == [{"ticker": "FAST"}]
    parsing = Event()
    release = Event()
    completed = Event()
    original_load = json.load

    def load(handle, *args, **kwargs):
        if Path(handle.name) == ticker_cache_path("slow").resolve():
            parsing.set()
            assert release.wait(5), "test did not release the slow parser"
        return original_load(handle, *args, **kwargs)

    def read_fast():
        result = sec_edgar_cache.load_cached_tickers("fast")
        completed.set()
        return result

    monkeypatch.setattr(sec_edgar_cache.json, "load", load)
    with ThreadPoolExecutor(max_workers=2) as executor:
        slow = executor.submit(sec_edgar_cache.load_cached_tickers, "slow")
        try:
            assert parsing.wait(5)
            fast = executor.submit(read_fast)
            assert completed.wait(1), "an unrelated cache hit waited for the slow parser"
        finally:
            release.set()
        assert fast.result(timeout=5) == [{"ticker": "FAST"}]
        assert slow.result(timeout=5) == [{"ticker": "SLOW"}]


@pytest.mark.parametrize("replace_file", [False, True])
@pytest.mark.parametrize("change_on_flush", [False, True])
def test_ticker_cold_write_does_not_seed_a_racing_file_change(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, replace_file: bool,
    change_on_flush: bool,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    path = ticker_cache_path()
    original_open = Path.open
    raced = Event()
    fresh = '{"0": {"ticker": "RACED"}}'

    class RacingWriter:
        def __init__(self, handle):
            self.handle = handle

        def __getattr__(self, name):
            return getattr(self.handle, name)

        def __enter__(self):
            self.handle.__enter__()
            return self

        def flush(self):
            self.handle.flush()
            if change_on_flush:
                self.change_file()

        def __exit__(self, *args):
            result = self.handle.__exit__(*args)
            if not change_on_flush:
                self.change_file()
            return result

        def change_file(self):
            if replace_file:
                replacement = tmp_path / "racing.json"
                replacement.write_text(fresh, encoding="utf-8")
                replacement.replace(path)
            else:
                with original_open(path, "w", encoding="utf-8") as handle:
                    handle.write(fresh)
            raced.set()

    def open_path(candidate, mode="r", *args, **kwargs):
        handle = original_open(candidate, mode, *args, **kwargs)
        if candidate == path and mode in {"w", "w+"}:
            return RacingWriter(handle)
        return handle

    monkeypatch.setattr(Path, "open", open_path)
    first = load_company_tickers_cached(
        lambda _: {"0": {"ticker": "FETCHED"}}, "https://example.test/tickers",
    )

    assert raced.is_set()
    assert first == [{"ticker": "FETCHED"}]
    assert sec_edgar_cache.load_cached_tickers() == [{"ticker": "RACED"}]


def test_ticker_path_locks_release_after_a_parser_exception(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    sec_edgar_cache.write_ticker_cache("exchange", {"0": {"ticker": "AAPL"}})
    original_load = json.load

    def fail(handle):
        raise OSError("simulated read failure")

    monkeypatch.setattr(sec_edgar_cache.json, "load", fail)
    with pytest.raises(OSError, match="simulated read failure"):
        sec_edgar_cache.load_cached_tickers()
    assert not sec_edgar_cache._TICKER_PATH_LOCKS
    monkeypatch.setattr(sec_edgar_cache.json, "load", original_load)
    assert sec_edgar_cache.load_cached_tickers() == [{"ticker": "AAPL"}]
    assert not sec_edgar_cache._TICKER_PATH_LOCKS
