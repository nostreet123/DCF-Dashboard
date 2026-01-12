from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from dataclasses import asdict

from dcf_engine.engine import DCFEngine
from dcf_engine.io.config_loader import load_config
from dcf_engine.io.export import export_forecast_csv, export_json
from dcf_engine.normalization import normalize_inputs
from dcf_engine.persist import ConvexRunPersister
from dcf_engine.reference import ConvexReferenceProvider


def _serialize(payload: dict[str, Any], out_path: Path | None) -> None:
    export_json(payload, out_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dcf_engine")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Run a DCF valuation.")
    run_parser.add_argument("--config", required=True, help="Path to YAML or JSON config.")
    run_parser.add_argument("--out", help="Optional output JSON file path.")
    run_parser.add_argument(
        "--include-trace",
        action="store_true",
        help="Include trace tables in output.",
    )
    run_parser.add_argument(
        "--use-convex",
        action="store_true",
        help="Resolve missing inputs from Convex reference data.",
    )
    run_parser.add_argument(
        "--forecast-csv",
        help="Optional forecast CSV output path.",
    )
    run_parser.add_argument(
        "--save-to-convex",
        action="store_true",
        help="Persist valuation run to Convex.",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "run":
        inputs, selector = load_config(args.config)
        provider = None
        if args.use_convex:
            provider = ConvexReferenceProvider()
        normalized, provenance = normalize_inputs(inputs, provider, selector)
        engine = DCFEngine()
        result, trace = engine.run(normalized)
        payload = {
            "inputs": inputs.model_dump(),
            "normalized_inputs": normalized.model_dump(),
            "result": result.model_dump(),
        }
        if provenance:
            payload["provenance"] = asdict(provenance)
        if args.include_trace:
            payload["trace"] = trace.model_dump()
        out_path = Path(args.out) if args.out else None
        if args.save_to_convex:
            persister = ConvexRunPersister()
            run = persister.save(
                inputs=inputs,
                normalized=normalized,
                provenance=provenance,
                result=result,
                trace=trace,
                primary_key_norm=selector.primary_key_norm if selector else None,
                region_code=selector.region_code if selector else None,
                as_of_date=selector.as_of_date if selector else None,
                include_trace=True,
            )
            payload["convex_run_id"] = run.get("runId")
            payload["convex_trace_id"] = run.get("traceId")

        _serialize(payload, out_path)
        if args.forecast_csv:
            export_forecast_csv(trace.forecast, Path(args.forecast_csv))
        return 0

    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
