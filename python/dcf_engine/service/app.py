from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, HTTPException, Query, Request

from dcf_engine.service.sec_edgar import fetch_company_facts, search_companies
from dcf_engine.workbench.run import run_workbench
from dcf_engine.workbench.schema import WorkbenchRequest, WorkbenchResponse

logger = logging.getLogger(__name__)

app = FastAPI(title="DCF Engine Service", version="0.1.0")
_DEBUG_LEVELS = {"error", "standard", "verbose"}


def _resolve_correlation_id(request: Request) -> str:
    correlation_id = request.headers.get("x-debug-id", "").strip()
    return correlation_id or uuid.uuid4().hex


def _resolve_debug_level(request: Request) -> str:
    level = request.headers.get("x-debug-level", "").strip().lower()
    if level in _DEBUG_LEVELS:
        return level
    return "standard"


@app.get("/sec/search")
def sec_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
) -> dict[str, object]:
    try:
        results = search_companies(q, limit=limit)
    except RuntimeError as exc:
        logger.exception("SEC search failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"results": results}


@app.get("/sec/facts")
def sec_facts(symbol: str = Query(..., min_length=1)) -> object:
    try:
        return fetch_company_facts(symbol)
    except ValueError as exc:
        logger.warning("Unknown ticker requested: %s", symbol)
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.exception("SEC facts fetch failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/dcf/compute", response_model=WorkbenchResponse)
def dcf_compute(payload: WorkbenchRequest, request: Request) -> WorkbenchResponse:
    correlation_id = _resolve_correlation_id(request)
    debug_level = _resolve_debug_level(request)
    logger.info(
        "DCF compute request received",
        extra={"correlation_id": correlation_id, "debug_level": debug_level},
    )
    try:
        response = run_workbench(payload)
        logger.info(
            "DCF compute request succeeded",
            extra={"correlation_id": correlation_id, "debug_level": debug_level},
        )
        return response
    except ValueError as exc:
        logger.warning("DCF compute failed: %s", exc)
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc), "correlationId": correlation_id},
        ) from exc
    except RuntimeError as exc:
        logger.exception("DCF compute error")
        raise HTTPException(
            status_code=500,
            detail={"message": str(exc), "correlationId": correlation_id},
        ) from exc
