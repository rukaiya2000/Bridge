"""Sync API. Run: uv run --group api uvicorn api.main:app --reload

Stores aggregates in MongoDB (api/db.py). Needs MONGODB_URI (an Atlas connection string) in .env.
Load the demo week: curl -X POST localhost:8000/sync -H 'content-type: application/json' --data @api/fixtures/sample_week.json
"""

from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pymongo.database import Database

from api import db as store
from api.models import SyncPayload


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = store.connect()
    app.state.db = store.database(client)
    store.ensure_schema(app.state.db)
    yield
    client.close()


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
