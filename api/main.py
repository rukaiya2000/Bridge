"""Sync API skeleton (Phase 2). Run: uv run --group api uvicorn api.main:app --reload

Stores aggregates in memory for now. TODO(phase 2): MongoDB collections for profiles, hourly counts,
parent settings, starter templates and tool ratings (PHASES.md).

Load the demo week: curl -X POST localhost:8000/sync -H 'content-type: application/json' --data @api/fixtures/sample_week.json
"""

from collections import defaultdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.models import SyncPayload

app = FastAPI(title="Bridge sync API")
# Local dev: the dashboard's Vite port varies (5173 is often taken), so allow any localhost port.
app.add_middleware(
    CORSMiddleware, allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+", allow_methods=["*"], allow_headers=["*"]
)

_store: dict[str, dict[str, SyncPayload]] = defaultdict(dict)  # child_id → week_start → payload


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/sync")
def sync(payload: SyncPayload) -> dict:
    _store[payload.child_id][payload.week_start] = payload
    return {"stored": True}


@app.get("/children/{child_id}/weeks")
def weeks(child_id: str) -> list[str]:
    """Week starts with data, newest first."""
    return sorted(_store.get(child_id, {}), reverse=True)


@app.get("/children/{child_id}/weeks/{week_start}")
def week(child_id: str, week_start: str) -> SyncPayload:
    try:
        return _store[child_id][week_start]
    except KeyError:
        raise HTTPException(404, "no data for that week")
