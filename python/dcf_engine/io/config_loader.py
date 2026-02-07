from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from dcf_engine.schema import InputAssumptions
from dcf_engine.normalization import ReferenceSelector


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


def load_config(path: str) -> tuple[InputAssumptions, ReferenceSelector | None]:
    raw = _load_raw(Path(path))
    reference = raw.pop("reference", None)
    inputs = InputAssumptions.model_validate(raw)
    selector = None
    if reference is not None:
        if not isinstance(reference, dict):
            raise ValueError("reference must be a mapping")
        as_of_date = reference.get("as_of_date")
        if hasattr(as_of_date, "isoformat"):
            as_of_date = as_of_date.isoformat()
        selector = ReferenceSelector(
            primary_key_norm=reference.get("primary_key_norm"),
            region_code=reference.get("region_code"),
            as_of_date=as_of_date,
            policy=reference.get("policy", "latest"),
        )
    return inputs, selector
