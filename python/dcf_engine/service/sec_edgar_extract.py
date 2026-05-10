from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Any

from dcf_engine.service.sec_edgar_models import EdgarStatement

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AnnualValue:
    fy: int
    value: float
    end: str | None
    filed: str | None


def select_unit(
    units: dict[str, list[dict[str, Any]]],
    preferred: list[str],
) -> list[dict[str, Any]]:
    for key in preferred:
        if key in units:
            return units[key]
    if not units:
        return []
    return next(iter(units.values()))


def _fiscal_year(entry: dict[str, Any]) -> int | None:
    fy = entry.get("fy")
    if fy is None:
        return None
    try:
        return int(fy)
    except (TypeError, ValueError):
        return None


def _annual_period_year(entry: dict[str, Any], *, prefer_fiscal_year: bool = False) -> int | None:
    fiscal_year = _fiscal_year(entry)
    if prefer_fiscal_year and fiscal_year is not None:
        return fiscal_year

    end = entry.get("end")
    if isinstance(end, str) and len(end) >= 4:
        try:
            return int(end[:4])
        except ValueError:
            return None

    return fiscal_year


def _is_annual_entry(entry: dict[str, Any]) -> bool:
    if entry.get("fp") != "FY":
        return False

    start = entry.get("start")
    end = entry.get("end")
    if not isinstance(start, str) or not isinstance(end, str):
        return True

    try:
        duration_days = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    except ValueError:
        return False

    return duration_days >= 300


def extract_annual_values(
    facts: dict[str, Any],
    tag: str,
    preferred_units: list[str],
    *,
    prefer_fiscal_year: bool = False,
) -> dict[int, AnnualValue]:
    fact_namespaces = facts.get("facts", {})
    tag_data = fact_namespaces.get("us-gaap", {}).get(tag)
    if not tag_data:
        tag_data = fact_namespaces.get("dei", {}).get(tag)
    if not tag_data:
        for namespace in fact_namespaces.values():
            if not isinstance(namespace, dict):
                continue
            tag_data = namespace.get(tag)
            if tag_data:
                break
    if not tag_data:
        return {}

    units = tag_data.get("units", {})
    entries = select_unit(units, preferred_units)
    by_year: dict[int, AnnualValue] = {}
    for entry in entries:
        if not _is_annual_entry(entry):
            continue

        value = entry.get("val")
        if value is None:
            continue
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            continue

        year = _annual_period_year(entry, prefer_fiscal_year=prefer_fiscal_year)
        if year is None:
            continue

        end = entry.get("end")
        filed = entry.get("filed")
        current = by_year.get(year)
        if current is None or (filed and (current.filed or "") < filed):
            by_year[year] = AnnualValue(fy=year, value=numeric_value, end=end, filed=filed)

    return by_year


def merge_missing_values(
    primary: dict[int, AnnualValue],
    fallback: dict[int, AnnualValue],
) -> dict[int, AnnualValue]:
    if not primary:
        return dict(fallback)
    merged = dict(primary)
    for year, value in fallback.items():
        merged.setdefault(year, value)
    return merged


def combine_values(
    current: dict[int, AnnualValue],
    long_term: dict[int, AnnualValue],
) -> dict[int, AnnualValue]:
    combined: dict[int, AnnualValue] = {}
    years = set(current.keys()) | set(long_term.keys())
    for year in years:
        current_value = current.get(year)
        long_value = long_term.get(year)
        total = (current_value.value if current_value else 0.0) + (
            long_value.value if long_value else 0.0
        )
        end = (long_value.end if long_value else None) or (
            current_value.end if current_value else None
        )
        filed_candidates = [
            value.filed for value in (current_value, long_value) if value and value.filed
        ]
        filed = max(filed_candidates) if filed_candidates else None
        combined[year] = AnnualValue(fy=year, value=total, end=end, filed=filed)

    return combined


def _period_end_for_year(
    year: int,
    revenue_value: AnnualValue | None,
    operating_income_value: AnnualValue | None,
    cash_value: AnnualValue | None,
    debt_value: AnnualValue | None,
    shares_value: AnnualValue | None,
) -> str:
    return (
        revenue_value.end
        if revenue_value and revenue_value.end
        else operating_income_value.end
        if operating_income_value and operating_income_value.end
        else cash_value.end
        if cash_value and cash_value.end
        else debt_value.end
        if debt_value and debt_value.end
        else shares_value.end
        if shares_value and shares_value.end
        else f"{year}-12-31"
    )


def _filing_date_for_year(
    revenue_value: AnnualValue | None,
    operating_income_value: AnnualValue | None,
    cash_value: AnnualValue | None,
    debt_value: AnnualValue | None,
    shares_value: AnnualValue | None,
) -> str | None:
    return (
        revenue_value.filed
        if revenue_value and revenue_value.filed
        else operating_income_value.filed
        if operating_income_value and operating_income_value.filed
        else cash_value.filed
        if cash_value and cash_value.filed
        else debt_value.filed
        if debt_value and debt_value.filed
        else shares_value.filed
        if shares_value and shares_value.filed
        else None
    )


def build_statements(
    facts: dict[str, Any],
    symbol: str,
) -> list[EdgarStatement]:
    revenue = extract_annual_values(
        facts,
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        ["USD"],
    )
    revenue = merge_missing_values(
        revenue,
        extract_annual_values(facts, "SalesRevenueNet", ["USD"]),
    )
    revenue = merge_missing_values(
        revenue,
        extract_annual_values(facts, "Revenues", ["USD"]),
    )
    operating_income = extract_annual_values(facts, "OperatingIncomeLoss", ["USD"])
    operating_income = merge_missing_values(
        operating_income,
        extract_annual_values(facts, "IncomeLossFromOperations", ["USD"]),
    )

    cash = extract_annual_values(
        facts,
        "CashAndCashEquivalentsAtCarryingValue",
        ["USD"],
    )
    if not cash:
        cash = extract_annual_values(
            facts,
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            ["USD"],
        )
    else:
        cash = merge_missing_values(
            cash,
            extract_annual_values(
                facts,
                "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
                ["USD"],
            ),
        )

    shares = extract_annual_values(
        facts,
        "CommonStockSharesOutstanding",
        ["shares"],
        prefer_fiscal_year=True,
    )
    if not shares:
        shares = extract_annual_values(
            facts,
            "EntityCommonStockSharesOutstanding",
            ["shares"],
            prefer_fiscal_year=True,
        )
    if not shares:
        shares = extract_annual_values(
            facts,
            "WeightedAverageNumberOfSharesOutstandingBasic",
            ["shares"],
        )

    debt_current = extract_annual_values(facts, "DebtCurrent", ["USD"])
    debt_long = extract_annual_values(facts, "LongTermDebtNoncurrent", ["USD"])
    debt = combine_values(debt_current, debt_long)
    if not debt:
        debt = extract_annual_values(facts, "LongTermDebt", ["USD"])

    years = sorted(revenue.keys(), reverse=True)
    if not years:
        logger.warning("No revenue data found for %s", symbol)
        years = sorted(
            set(operating_income.keys())
            | set(cash.keys())
            | set(debt.keys())
            | set(shares.keys()),
            reverse=True,
        )

    statements: list[EdgarStatement] = []
    for year in years[:5]:
        revenue_value = revenue.get(year)
        operating_income_value = operating_income.get(year)
        cash_value = cash.get(year)
        debt_value = debt.get(year)
        shares_value = shares.get(year)
        operating_margin = (
            operating_income_value.value / revenue_value.value
            if revenue_value and revenue_value.value and operating_income_value
            else None
        )
        statements.append(
            EdgarStatement(
                period_end=_period_end_for_year(
                    year,
                    revenue_value,
                    operating_income_value,
                    cash_value,
                    debt_value,
                    shares_value,
                ),
                period_type="FY",
                filing_date=_filing_date_for_year(
                    revenue_value,
                    operating_income_value,
                    cash_value,
                    debt_value,
                    shares_value,
                ),
                currency="USD",
                revenue=revenue_value.value if revenue_value else None,
                operating_income=operating_income_value.value
                if operating_income_value
                else None,
                operating_margin=operating_margin,
                cash=cash_value.value if cash_value else None,
                debt=debt_value.value if debt_value else None,
                shares_outstanding=shares_value.value if shares_value else None,
                source="edgar",
            )
        )

    return statements
