from __future__ import annotations

import json
import os
from dataclasses import asdict
from typing import Any

from dcf_engine import __version__
from dcf_engine.convex_transport import ConvexTransport
from dcf_engine.schema import InputAssumptions, NormalizedAssumptions, Trace, ValuationResult
from dcf_engine.normalization import Provenance


MAX_TRACE_BYTES = 180_000


class ConvexRunPersister:
    def __init__(self, convex_url: str | None = None) -> None:
        resolved_url = convex_url or os.getenv("CONVEX_URL")
        if not resolved_url:
            raise ValueError("CONVEX_URL is required")
        self._sync_token = os.getenv("DAMODARAN_SYNC_TOKEN")
        self._transport = ConvexTransport(
            resolved_url,
            sync_token=self._sync_token,
            max_attempts=1,
            retry_transient=False,
        )

    def save(
        self,
        inputs: InputAssumptions,
        normalized: NormalizedAssumptions | None,
        provenance: Provenance | None,
        result: ValuationResult | None,
        trace: Trace | None,
        primary_key_norm: str | None,
        region_code: str | None,
        as_of_date: str | None,
        error: str | None = None,
        include_trace: bool = True,
    ) -> dict[str, Any]:
        if not self._sync_token:
            raise ValueError("DAMODARAN_SYNC_TOKEN is required to save runs")
        status = "success" if error is None else "error"
        trace_payload = trace.model_dump() if trace and include_trace else None
        trace_storage = "none"
        trace_bytes = 0
        if trace_payload is not None:
            trace_bytes = len(
                json.dumps(trace_payload, separators=(",", ":"), ensure_ascii=True).encode(
                    "utf-8"
                )
            )
            if trace_bytes <= MAX_TRACE_BYTES:
                trace_storage = "inline"
            else:
                trace_storage = "external"
        payload: dict[str, Any] = {
            "engineVersion": __version__,
            "status": status,
            "inputs": inputs.model_dump(),
            "traceStorage": trace_storage,
        }
        if error is not None:
            payload["error"] = error
        if normalized is not None:
            payload["normalizedInputs"] = normalized.model_dump()
        if provenance is not None:
            payload["provenance"] = asdict(provenance)
        if result is not None:
            payload["resultSummary"] = result.model_dump()
        if primary_key_norm is not None:
            payload["primaryKeyNorm"] = primary_key_norm
        if region_code is not None:
            payload["regionCode"] = region_code
        if as_of_date is not None:
            payload["asOfDate"] = as_of_date
        if trace_storage != "none" and trace_payload is not None:
            payload["trace"] = trace_payload
        if trace_storage != "none" and trace_bytes:
            payload["traceByteSize"] = trace_bytes
        return self._transport.mutation("valuations:create", payload)
