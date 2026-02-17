from __future__ import annotations

import logging
from dataclasses import dataclass
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


def extract_annual_values(
    facts: dict[str, Any],
    tag: str,
    preferred_units: list[str],
) -> dict[int, AnnualValue]:
    tag_data = facts.get("facts", {}).get("us-gaap", {}).get(tag)
    if not tag_data:
        return {}

    units = tag_data.get("units", {})
    entries = select_unit(units, preferred_units)
    by_year: dict[int, AnnualValue] = {}
    for entry in entries:
        fy = entry.get("fy")
        if fy is None:
            continue
        if entry.get("fp") != "FY":
            continue

        value = entry.get("val")
        if value is None:
            continue
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            continue

        year = int(fy)
        end = entry.get("end")
        filed = entry.get("filed")
        current = by_year.get(year)
        if current is None or (filed and (current.filed or "") < filed):
            by_year[year] = AnnualValue(fy=year, value=numeric_value, end=end, filed=filed)

    return by_year


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
    cash_value: AnnualValue | None,
    debt_value: AnnualValue | None,
    shares_value: AnnualValue | None,
) -> str:
    return (
        revenue_value.end
        if revenue_value and revenue_value.end
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
    cash_value: AnnualValue | None,
    debt_value: AnnualValue | None,
    shares_value: AnnualValue | None,
) -> str | None:
    return (
        revenue_value.filed
        if revenue_value and revenue_value.filed
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
    revenue = extract_annual_values(facts, "Revenues", ["USD"])
    if not revenue:
        revenue = extract_annual_values(facts, "SalesRevenueNet", ["USD"])

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

    shares = extract_annual_values(facts, "CommonStockSharesOutstanding", ["shares"])
    if not shares:
        shares = extract_annual_values(
            facts,
            "EntityCommonStockSharesOutstanding",
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
            set(cash.keys()) | set(debt.keys()) | set(shares.keys()),
            reverse=True,
        )

    statements: list[EdgarStatement] = []
    for year in years[:5]:
        revenue_value = revenue.get(year)
        cash_value = cash.get(year)
        debt_value = debt.get(year)
        shares_value = shares.get(year)
        statements.append(
            EdgarStatement(
                period_end=_period_end_for_year(
                    year,
                    revenue_value,
                    cash_value,
                    debt_value,
                    shares_value,
                ),
                period_type="FY",
                filing_date=_filing_date_for_year(
                    revenue_value,
                    cash_value,
                    debt_value,
                    shares_value,
                ),
                currency="USD",
                revenue=revenue_value.value if revenue_value else None,
                cash=cash_value.value if cash_value else None,
                debt=debt_value.value if debt_value else None,
                shares_outstanding=shares_value.value if shares_value else None,
                source="edgar",
            )
        )

    return statements
