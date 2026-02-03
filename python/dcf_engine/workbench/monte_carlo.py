from __future__ import annotations

import math
import random
from dataclasses import dataclass

from dcf_engine.engine import DCFEngine
from dcf_engine.schema import InputAssumptions
from dcf_engine.workbench.schema import (
    MonteCarloHistogram,
    MonteCarloOneFactor,
    MonteCarloResult,
    MonteCarloSpec,
    MonteCarloSummary,
    ScenarioAssumptions,
    WorkbenchRequest,
)


@dataclass(frozen=True)
class _Triangular:
    low: float
    mode: float
    high: float

    def sample(self, rng: random.Random) -> float:
        return rng.triangular(self.low, self.high, self.mode)


def _triangular_from_scenarios(base: float, bull: float, bear: float) -> _Triangular:
    low = min(base, bull, bear)
    high = max(base, bull, bear)
    return _Triangular(low=low, mode=base, high=high)


def _normal_cdf(x: float) -> float:
    # Standard normal CDF via erf.
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _triangular_ppf(u: float, dist: _Triangular) -> float:
    low, mode, high = dist.low, dist.mode, dist.high
    if low == high:
        return low
    if u <= 0.0:
        return low
    if u >= 1.0:
        return high

    c = (mode - low) / (high - low)
    if u < c:
        return low + math.sqrt(u * (high - low) * (mode - low))
    return high - math.sqrt((1.0 - u) * (high - low) * (high - mode))


def _quantile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        raise ValueError("Cannot compute quantile for empty list")
    if q <= 0.0:
        return sorted_values[0]
    if q >= 1.0:
        return sorted_values[-1]
    idx = (len(sorted_values) - 1) * q
    low = int(math.floor(idx))
    high = int(math.ceil(idx))
    if low == high:
        return sorted_values[low]
    fraction = idx - low
    return (sorted_values[low] * (1.0 - fraction)) + (sorted_values[high] * fraction)


def _smooth(values: list[float], window: int = 3) -> list[float]:
    if window <= 1 or len(values) <= 2:
        return values
    radius = window // 2
    smoothed: list[float] = []
    for idx in range(len(values)):
        start = max(0, idx - radius)
        end = min(len(values), idx + radius + 1)
        smoothed.append(sum(values[start:end]) / (end - start))
    return smoothed


def _build_histogram(values: list[float], bins: int | None) -> MonteCarloHistogram:
    if not values:
        return MonteCarloHistogram(bin_centers=[], density=[])

    vmin = min(values)
    vmax = max(values)
    if vmin == vmax:
        return MonteCarloHistogram(bin_centers=[vmin], density=[1.0])

    n = len(values)
    requested_bins = bins if bins is not None else int(math.sqrt(n))
    bin_count = max(10, min(200, requested_bins))

    width = (vmax - vmin) / bin_count
    counts = [0 for _ in range(bin_count)]
    for value in values:
        idx = int((value - vmin) / width)
        if idx >= bin_count:
            idx = bin_count - 1
        counts[idx] += 1

    max_count = max(counts) if counts else 0
    heights = [count / max_count if max_count else 0.0 for count in counts]
    heights = _smooth(heights, window=3)
    max_height = max(heights) if heights else 0.0
    density = [height / max_height if max_height else 0.0 for height in heights]

    bin_centers = [vmin + (idx + 0.5) * width for idx in range(bin_count)]
    return MonteCarloHistogram(bin_centers=bin_centers, density=density)


def _sample_one_factor_u(
    rng: random.Random,
    z: float,
    loading: float,
    sign: float,
) -> float:
    eps = rng.gauss(0.0, 1.0)
    x = (sign * loading * z) + (math.sqrt(1.0 - loading * loading) * eps)
    # Clamp away from exact 0/1 to avoid edge issues in downstream transforms.
    u = _normal_cdf(x)
    return min(1.0 - 1e-12, max(1e-12, u))


def _build_inputs(
    request: WorkbenchRequest,
    revenue_growth: float,
    ebit_margin: float,
    tax_rate: float,
    sales_to_capital: float,
    wacc: float,
    g_stable: float,
    stable_spread: float,
) -> InputAssumptions:
    periods = request.periods
    return InputAssumptions(
        base_year=request.base_year,
        periods=periods,
        currency=request.currency,
        revenue_t0=request.revenue_t0,
        revenue_growth=[revenue_growth] * periods,
        ebit_margin=[ebit_margin] * periods,
        tax_rate=[tax_rate] * periods,
        sales_to_capital=[sales_to_capital] * periods,
        reinvestment_lag_years=request.reinvestment_lag_years,
        wacc=[wacc] * periods,
        g_stable=g_stable,
        wacc_stable=g_stable + stable_spread,
        cash=request.cash,
        debt=request.debt,
        other_non_operating_assets=request.other_non_operating_assets,
        shares_outstanding=request.shares_outstanding,
    )


def _spread(assumptions: ScenarioAssumptions) -> float:
    return assumptions.wacc_stable - assumptions.g_stable


def run_monte_carlo(
    engine: DCFEngine,
    request: WorkbenchRequest,
    spec: MonteCarloSpec,
) -> MonteCarloResult:
    rng = random.Random(spec.seed)

    base = request.base
    bull = request.bull
    bear = request.bear

    growth_dist = _triangular_from_scenarios(
        base=base.revenue_growth,
        bull=bull.revenue_growth,
        bear=bear.revenue_growth,
    )
    margin_dist = _triangular_from_scenarios(
        base=base.ebit_margin,
        bull=bull.ebit_margin,
        bear=bear.ebit_margin,
    )
    tax_dist = _triangular_from_scenarios(
        base=base.tax_rate,
        bull=bull.tax_rate,
        bear=bear.tax_rate,
    )
    stc_dist = _triangular_from_scenarios(
        base=base.sales_to_capital,
        bull=bull.sales_to_capital,
        bear=bear.sales_to_capital,
    )
    wacc_dist = _triangular_from_scenarios(
        base=base.wacc,
        bull=bull.wacc,
        bear=bear.wacc,
    )
    g_stable_dist = _triangular_from_scenarios(
        base=base.g_stable,
        bull=bull.g_stable,
        bear=bear.g_stable,
    )

    base_spread = _spread(base)
    bull_spread = _spread(bull)
    bear_spread = _spread(bear)
    if base_spread <= 0 or bull_spread <= 0 or bear_spread <= 0:
        raise ValueError("wacc_stable must be greater than g_stable for all scenarios")
    spread_dist = _triangular_from_scenarios(
        base=base_spread,
        bull=bull_spread,
        bear=bear_spread,
    )

    results: list[float] = []
    attempts = 0
    max_attempts = spec.runs * 50

    dependence = spec.dependence
    use_one_factor = isinstance(dependence, MonteCarloOneFactor)
    one_factor_loading = dependence.loading if use_one_factor else 0.0

    while len(results) < spec.runs:
        attempts += 1
        if attempts > max_attempts:
            raise ValueError(
                "Unable to generate valid Monte Carlo samples "
                f"({len(results)}/{spec.runs} completed)"
            )

        if use_one_factor:
            # Latent "business quality" factor. Positive z means better outcomes.
            z = rng.gauss(0.0, 1.0)

            revenue_growth = _triangular_ppf(
                _sample_one_factor_u(rng, z, one_factor_loading, sign=+1.0),
                growth_dist,
            )
            ebit_margin = _triangular_ppf(
                _sample_one_factor_u(rng, z, one_factor_loading, sign=+1.0),
                margin_dist,
            )
            # Tax rates don't reliably co-move with execution; keep independent.
            tax_rate = tax_dist.sample(rng)
            sales_to_capital = _triangular_ppf(
                _sample_one_factor_u(rng, z, one_factor_loading, sign=+1.0),
                stc_dist,
            )
            # Better execution => lower risk premium / WACC.
            wacc = _triangular_ppf(
                _sample_one_factor_u(rng, z, one_factor_loading, sign=-1.0),
                wacc_dist,
            )
            g_stable = _triangular_ppf(
                _sample_one_factor_u(rng, z, one_factor_loading, sign=+1.0),
                g_stable_dist,
            )
            stable_spread = _triangular_ppf(
                _sample_one_factor_u(rng, z, one_factor_loading, sign=-1.0),
                spread_dist,
            )
        else:
            revenue_growth = growth_dist.sample(rng)
            ebit_margin = margin_dist.sample(rng)
            tax_rate = tax_dist.sample(rng)
            sales_to_capital = stc_dist.sample(rng)
            wacc = wacc_dist.sample(rng)
            g_stable = g_stable_dist.sample(rng)
            stable_spread = spread_dist.sample(rng)

        if sales_to_capital <= 0:
            continue
        if stable_spread <= 0:
            continue

        inputs = _build_inputs(
            request=request,
            revenue_growth=revenue_growth,
            ebit_margin=ebit_margin,
            tax_rate=tax_rate,
            sales_to_capital=sales_to_capital,
            wacc=wacc,
            g_stable=g_stable,
            stable_spread=stable_spread,
        )
        valuation, _ = engine.run(inputs)
        results.append(valuation.fair_value_per_share)

    sorted_values = sorted(results)
    mean = sum(sorted_values) / len(sorted_values)

    summary = MonteCarloSummary(
        min=sorted_values[0],
        max=sorted_values[-1],
        mean=mean,
        median=_quantile(sorted_values, 0.5),
        p10=_quantile(sorted_values, 0.10),
        p25=_quantile(sorted_values, 0.25),
        p75=_quantile(sorted_values, 0.75),
        p90=_quantile(sorted_values, 0.90),
    )
    histogram = _build_histogram(sorted_values, bins=spec.bins)

    return MonteCarloResult(
        runs=len(sorted_values),
        seed=spec.seed,
        summary=summary,
        histogram=histogram,
    )
