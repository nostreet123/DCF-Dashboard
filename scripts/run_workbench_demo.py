from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from dcf_engine.workbench.run import run_workbench
from dcf_engine.workbench.schema import WorkbenchRequest


def build_summary(response: object) -> dict[str, object]:
    workbench_response = response
    base = workbench_response.base.valuation.fair_value_per_share
    bull = workbench_response.bull.valuation.fair_value_per_share
    bear = workbench_response.bear.valuation.fair_value_per_share
    sensitivity_rows = len(workbench_response.sensitivity.values)
    sensitivity_cols = (
        len(workbench_response.sensitivity.values[0])
        if workbench_response.sensitivity.values
        else 0
    )
    monte_carlo = None
    if workbench_response.monte_carlo is not None:
        monte_carlo = {
            "runs": workbench_response.monte_carlo.runs,
            "seed": workbench_response.monte_carlo.seed,
            "p10": workbench_response.monte_carlo.summary.p10,
            "median": workbench_response.monte_carlo.summary.median,
            "p90": workbench_response.monte_carlo.summary.p90,
        }

    return {
        "base_fair_value_per_share": round(base, 4),
        "bull_fair_value_per_share": round(bull, 4),
        "bear_fair_value_per_share": round(bear, 4),
        "sensitivity_grid": [sensitivity_rows, sensitivity_cols],
        "monte_carlo": monte_carlo,
        "kpi_count": len(workbench_response.kpis.kpis),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the local DCF workbench against a sample request JSON file."
    )
    parser.add_argument(
        "request_file",
        nargs="?",
        default=str(REPO_ROOT / "examples" / "workbench-demo-request.json"),
        help="Path to a WorkbenchRequest JSON file.",
    )
    args = parser.parse_args()

    request_path = Path(args.request_file).resolve()
    request = WorkbenchRequest.model_validate_json(request_path.read_text())
    response = run_workbench(request)
    print(json.dumps(build_summary(response), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
