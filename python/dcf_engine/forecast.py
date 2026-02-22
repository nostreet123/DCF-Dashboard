from __future__ import annotations

from dcf_engine.schema import ForecastTable, NormalizedAssumptions


def build_forecast(inputs: NormalizedAssumptions) -> ForecastTable:
    periods = inputs.periods

    revenue: list[float] = []
    revenue_growth: list[float] = []
    ebit_margin: list[float] = []
    ebit: list[float] = []
    tax_rate: list[float] = []
    nopat: list[float] = []
    sales_to_capital: list[float] = []
    reinvestment: list[float] = []
    fcff: list[float] = []

    prior_revenue = inputs.revenue_t0

    for idx in range(periods):
        growth = inputs.revenue_growth[idx]
        margin = inputs.ebit_margin[idx]
        tax = inputs.tax_rate[idx]
        stc = inputs.sales_to_capital[idx]

        current_revenue = prior_revenue * (1.0 + growth)
        current_ebit = current_revenue * margin
        current_nopat = current_ebit * (1.0 - tax)

        lag_index = idx - inputs.reinvestment_lag_years
        if lag_index < 0:
            lag_index = 0
        stc_for_reinvestment = inputs.sales_to_capital[lag_index]
        if stc_for_reinvestment <= 0:
            raise ValueError("sales_to_capital must be positive")
        current_reinvestment = (current_revenue - prior_revenue) / stc_for_reinvestment

        current_fcff = current_nopat - current_reinvestment

        revenue.append(current_revenue)
        revenue_growth.append(growth)
        ebit_margin.append(margin)
        ebit.append(current_ebit)
        tax_rate.append(tax)
        nopat.append(current_nopat)
        sales_to_capital.append(stc)
        reinvestment.append(current_reinvestment)
        fcff.append(current_fcff)

        prior_revenue = current_revenue

    t = list(range(1, periods + 1))
    years = [inputs.base_year + i for i in t]

    return ForecastTable(
        t=t,
        years=years,
        revenue=revenue,
        revenue_growth=revenue_growth,
        ebit_margin=ebit_margin,
        ebit=ebit,
        tax_rate=tax_rate,
        nopat=nopat,
        sales_to_capital=sales_to_capital,
        reinvestment=reinvestment,
        fcff=fcff,
    )
