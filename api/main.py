"""Sync API skeleton (Phase 2). Run: uv run --group api uvicorn api.main:app --reload

Stores aggregates in memory for now. TODO(phase 2): MongoDB collections for profiles, hourly counts,
parent settings, starter templates and tool ratings (PHASES.md).
"""

from collections import defaultdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.models import SyncPayload

app = FastAPI(title="Bridge sync API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

_store: dict[str, dict[str, SyncPayload]] = defaultdict(dict)  # child_id → week_start → payload


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/sync")
def sync(payload: SyncPayload) -> dict:
    _store[payload.child_id][payload.week_start] = payload
    return {"stored": True}


@app.get("/children/{child_id}/weeks/{week_start}")
def week(child_id: str, week_start: str) -> SyncPayload:
    try:
        return _store[child_id][week_start]
    except KeyError:
        raise HTTPException(404, "no data for that week")
