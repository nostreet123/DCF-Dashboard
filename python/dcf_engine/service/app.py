from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Query

from dcf_engine.service.sec_edgar import fetch_company_facts, search_companies
from dcf_engine.workbench.run import run_workbench
from dcf_engine.workbench.schema import WorkbenchRequest, WorkbenchResponse

logger = logging.getLogger(__name__)

app = FastAPI(title="DCF Engine Service", version="0.1.0")


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
def dcf_compute(request: WorkbenchRequest) -> WorkbenchResponse:
    try:
        return run_workbench(request)
    except ValueError as exc:
        logger.warning("DCF compute failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.exception("DCF compute error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
