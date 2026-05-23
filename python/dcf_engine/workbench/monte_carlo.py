from __future__ import annotations

import math
import random
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from dcf_engine.valuation_kernel import compute_equity_value_per_share_vectorized
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


def _triangular_ppf_array(u: NDArray[np.float64], dist: _Triangular) -> NDArray[np.float64]:
    low, mode, high = dist.low, dist.mode, dist.high
    if low == high:
        return np.full_like(u, low, dtype=np.float64)

    clipped = np.clip(u, 1e-12, 1.0 - 1e-12)
    c = (mode - low) / (high - low)
    lower = low + np.sqrt(clipped * (high - low) * (mode - low))
    upper = high - np.sqrt((1.0 - clipped) * (high - low) * (high - mode))
    return np.where(clipped < c, lower, upper)


def _normal_cdf_array(x: NDArray[np.float64]) -> NDArray[np.float64]:
    # Fast vectorized approximation to the standard normal CDF. The exact math.erf
    # path is kept for scalar tests; Monte Carlo needs speed more than bit parity.
    return 0.5 * (1.0 + np.tanh(0.7978845608028654 * (x + 0.044715 * np.power(x, 3))))


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
    density = [count / max_count if max_count else 0.0 for count in counts]

    bin_centers = [vmin + (idx + 0.5) * width for idx in range(bin_count)]
    return MonteCarloHistogram(bin_centers=bin_centers, density=density)


def _build_histogram_array(values: NDArray[np.float64], bins: int | None) -> MonteCarloHistogram:
    if values.size == 0:
        return MonteCarloHistogram(bin_centers=[], density=[])

    vmin = float(np.min(values))
    vmax = float(np.max(values))
    if vmin == vmax:
        return MonteCarloHistogram(bin_centers=[vmin], density=[1.0])

    requested_bins = bins if bins is not None else int(math.sqrt(int(values.size)))
    bin_count = max(10, min(200, requested_bins))
    counts, edges = np.histogram(values, bins=bin_count, range=(vmin, vmax))
    max_count = int(counts.max()) if counts.size else 0
    density = (counts / max_count).astype(float).tolist() if max_count else [0.0] * bin_count
    centers = ((edges[:-1] + edges[1:]) / 2.0).astype(float).tolist()
    return MonteCarloHistogram(bin_centers=centers, density=density)


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


def _spread(assumptions: ScenarioAssumptions) -> float:
    return assumptions.wacc_stable - assumptions.g_stable


def _sample_terminal_values(
    rng: np.random.Generator,
    dist: _Triangular,
    runs: int,
    latent_quality: NDArray[np.float64] | None,
    loading: float,
    sign: float,
) -> NDArray[np.float64]:
    if dist.low == dist.high:
        return np.full(runs, dist.low, dtype=np.float64)
    if latent_quality is None:
        return rng.triangular(dist.low, dist.mode, dist.high, size=runs).astype(np.float64)

    eps = rng.normal(0.0, 1.0, size=runs)
    x = (sign * loading * latent_quality) + (math.sqrt(1.0 - loading * loading) * eps)
    return _triangular_ppf_array(_normal_cdf_array(x), dist)


def _sample_raw_paths(
    rng: np.random.Generator,
    dist: _Triangular,
    runs: int,
    periods: int,
    latent_quality: NDArray[np.float64] | None,
    loading: float,
    sign: float,
) -> NDArray[np.float64]:
    if dist.low == dist.high:
        return np.full((runs, periods), dist.low, dtype=np.float64)
    if latent_quality is None:
        return rng.triangular(dist.low, dist.mode, dist.high, size=(runs, periods)).astype(np.float64)

    eps = rng.normal(0.0, 1.0, size=(runs, periods))
    x = (sign * loading * latent_quality[:, None]) + (
        math.sqrt(1.0 - loading * loading) * eps
    )
    return _triangular_ppf_array(_normal_cdf_array(x), dist)


def _mean_reverting_paths(
    raw: NDArray[np.float64],
    dist: _Triangular,
    target: float | NDArray[np.float64],
    shock_weight: float = 0.35,
) -> NDArray[np.float64]:
    runs, periods = raw.shape
    paths = np.empty_like(raw, dtype=np.float64)
    paths[:, 0] = raw[:, 0]
    target_values = (
        np.full(runs, float(target), dtype=np.float64)
        if isinstance(target, float | int)
        else target.astype(np.float64)
    )

    for idx in range(1, periods):
        progress = idx / max(1, periods - 1)
        speed = 0.12 + (0.23 * progress)
        centered_shock = raw[:, idx] - dist.mode
        paths[:, idx] = (
            ((1.0 - speed) * paths[:, idx - 1])
            + (speed * target_values)
            + (shock_weight * centered_shock)
        )

    lower_bound = min(dist.low, float(np.min(target_values)))
    upper_bound = max(dist.high, float(np.max(target_values)))
    return np.clip(paths, lower_bound, upper_bound)


def _sample_dynamic_paths(
    rng: np.random.Generator,
    dist: _Triangular,
    runs: int,
    periods: int,
    target: float | NDArray[np.float64],
    latent_quality: NDArray[np.float64] | None = None,
    loading: float = 0.0,
    sign: float = 1.0,
) -> NDArray[np.float64]:
    raw = _sample_raw_paths(
        rng=rng,
        dist=dist,
        runs=runs,
        periods=periods,
        latent_quality=latent_quality,
        loading=loading,
        sign=sign,
    )
    return _mean_reverting_paths(raw, dist, target)


def _run_vectorized_dynamic_monte_carlo(
    request: WorkbenchRequest,
    spec: MonteCarloSpec,
    growth_dist: _Triangular,
    margin_dist: _Triangular,
    tax_dist: _Triangular,
    stc_dist: _Triangular,
    wacc_dist: _Triangular,
    g_stable_dist: _Triangular,
    spread_dist: _Triangular,
    dependence: MonteCarloOneFactor | None,
) -> NDArray[np.float64]:
    runs = spec.runs
    periods = request.periods
    rng = np.random.default_rng(spec.seed)
    if stc_dist.low <= 0.0:
        raise ValueError("Monte Carlo sales-to-capital samples must be positive")

    latent_quality: NDArray[np.float64] | None = None
    loading = 0.0
    if dependence is not None:
        latent_quality = rng.normal(0.0, 1.0, size=runs)
        loading = dependence.loading

    g_stable = _sample_terminal_values(
        rng, g_stable_dist, runs, latent_quality, loading, sign=1.0
    )
    stable_spread = _sample_terminal_values(
        rng, spread_dist, runs, latent_quality, loading, sign=-1.0
    )
    wacc_stable = g_stable + stable_spread

    growth = _sample_dynamic_paths(
        rng, growth_dist, runs, periods, target=g_stable, latent_quality=latent_quality, loading=loading, sign=1.0
    )
    margin = _sample_dynamic_paths(
        rng, margin_dist, runs, periods, target=request.base.ebit_margin, latent_quality=latent_quality, loading=loading, sign=1.0
    )
    tax = _sample_dynamic_paths(
        rng, tax_dist, runs, periods, target=request.base.tax_rate, latent_quality=None, loading=0.0, sign=1.0
    )
    sales_to_capital = _sample_dynamic_paths(
        rng, stc_dist, runs, periods, target=request.base.sales_to_capital, latent_quality=latent_quality, loading=loading, sign=1.0
    )
    if np.any(sales_to_capital <= 0.0):
        raise ValueError("Monte Carlo sales-to-capital samples must be positive")
    wacc = _sample_dynamic_paths(
        rng, wacc_dist, runs, periods, target=wacc_stable, latent_quality=latent_quality, loading=loading, sign=-1.0
    )

    values = compute_equity_value_per_share_vectorized(
        revenue_t0=request.revenue_t0,
        growth=growth,
        margin=margin,
        tax=tax,
        sales_to_capital=sales_to_capital,
        wacc=wacc,
        g_stable=g_stable,
        wacc_stable=wacc_stable,
        periods=periods,
        reinvestment_lag_years=request.reinvestment_lag_years,
        cash=request.cash,
        debt=request.debt,
        other_non_operating_assets=request.other_non_operating_assets,
        shares_outstanding=request.shares_outstanding,
    )
    finite_values = values[np.isfinite(values)]
    if finite_values.size != runs:
        raise ValueError(
            "Unable to generate valid Monte Carlo samples "
            f"({finite_values.size}/{runs} completed)"
        )
    return finite_values.astype(np.float64)


def run_monte_carlo(
    request: WorkbenchRequest,
    spec: MonteCarloSpec,
) -> MonteCarloResult:
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

    dependence = spec.dependence
    one_factor = dependence if isinstance(dependence, MonteCarloOneFactor) else None
    values = _run_vectorized_dynamic_monte_carlo(
        request=request,
        spec=spec,
        growth_dist=growth_dist,
        margin_dist=margin_dist,
        tax_dist=tax_dist,
        stc_dist=stc_dist,
        wacc_dist=wacc_dist,
        g_stable_dist=g_stable_dist,
        spread_dist=spread_dist,
        dependence=one_factor,
    )
    sorted_values = np.sort(values)

    summary = MonteCarloSummary(
        min=float(sorted_values[0]),
        max=float(sorted_values[-1]),
        mean=float(np.mean(sorted_values)),
        median=float(np.quantile(sorted_values, 0.50)),
        p10=float(np.quantile(sorted_values, 0.10)),
        p25=float(np.quantile(sorted_values, 0.25)),
        p75=float(np.quantile(sorted_values, 0.75)),
        p90=float(np.quantile(sorted_values, 0.90)),
    )
    histogram = _build_histogram_array(values, bins=spec.bins)

    return MonteCarloResult(
        runs=int(values.size),
        seed=spec.seed,
        summary=summary,
        histogram=histogram,
    )
