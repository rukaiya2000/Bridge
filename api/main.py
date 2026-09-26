"""Sync API. Run: uv run --group api uvicorn api.main:app --reload

Stores aggregates in MongoDB (api/db.py). Needs MONGODB_URI (an Atlas connection string) in .env.
Load the demo weeks: for f in sample_prev_week sample_week; do curl -X POST localhost:8000/sync -H 'content-type: application/json' --data @api/fixtures/$f.json; done
"""

import logging
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pymongo.database import Database

from api import db as store
from api.models import Starter, SyncPayload, ToolRating, TopicTrend


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = store.connect()
    app.state.db = store.database(client)
    store.ensure_schema(app.state.db)
    yield
    client.close()


# uvicorn only configures its own loggers, so ours needs a handler to show up in the terminal.
log = logging.getLogger("bridge.api")
log.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("%(levelname)s:     [bridge] %(message)s"))
log.addHandler(_handler)

app = FastAPI(title="Bridge sync API", lifespan=lifespan)
# Local dev: the dashboard's Vite port varies (5173 is often taken), so allow any localhost port.
app.add_middleware(
    CORSMiddleware, allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+", allow_methods=["*"], allow_headers=["*"]
)


def get_db(request: Request) -> Database:
    return request.app.state.db


Db = Annotated[Database, Depends(get_db)]


@app.get("/health")
def health(db: Db) -> dict:
    db.command("ping")
    return {"ok": True}


@app.post("/sync")
def sync(payload: SyncPayload, db: Db) -> dict:
    log.info(
        "sync child=%s week=%s sites=%s topics=%s",
        payload.child_id,
        payload.week_start,
        [(s.site, s.level, round(s.score, 1)) for s in payload.sites],
        dict(sum((Counter({t.topic: t.count}) for t in payload.hourly_topics), Counter())),
    )
    store.save_week(db, payload)
    return {"stored": True}


@app.get("/children/{child_id}/weeks")
def weeks(child_id: str, db: Db) -> list[str]:
    """Week starts with data, newest first."""
    return store.list_weeks(db, child_id)


@app.get("/children/{child_id}/weeks/{week_start}")
def week(child_id: str, week_start: date, db: Db) -> SyncPayload:
    found = store.load_week(db, child_id, week_start)
    if found is None:
        raise HTTPException(404, "no data for that week")
    return found


@app.get("/children/{child_id}/weeks/{week_start}/topics")
def topics(child_id: str, week_start: date, db: Db) -> list[TopicTrend]:
    """Per-topic counts this week vs last week, most frequent first."""
    return store.topic_trend(db, child_id, week_start)


@app.get("/tools/ratings")
def ratings(db: Db) -> list[ToolRating]:
    return store.tool_ratings(db)


@app.get("/starters")
def list_starters(db: Db) -> list[Starter]:
    return store.starters(db)
