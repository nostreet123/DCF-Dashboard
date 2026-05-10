from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from dcf_engine.normalization import ReferenceSelector
from dcf_engine.schema import InputAssumptions


def _load_raw(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() in {".yaml", ".yml"}:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    elif path.suffix.lower() == ".json":
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    else:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)

    if not isinstance(data, dict):
        raise ValueError("config must be a mapping at the top level")
    return data


def _normalize_as_of_date(value: Any) -> str | None:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _build_reference_selector(reference: Any) -> ReferenceSelector | None:
    if reference is None:
        return None
    if not isinstance(reference, dict):
        raise ValueError("reference must be a mapping")

    return ReferenceSelector(
        primary_key_norm=reference.get("primary_key_norm"),
        region_code=reference.get("region_code"),
        as_of_date=_normalize_as_of_date(reference.get("as_of_date")),
        policy=reference.get("policy", "latest"),
    )


def load_config(path: str) -> tuple[InputAssumptions, ReferenceSelector | None]:
    payload = _load_raw(Path(path))
    reference_payload = payload.pop("reference", None)
    inputs = InputAssumptions.model_validate(payload)
    selector = _build_reference_selector(reference_payload)
    return inputs, selector
