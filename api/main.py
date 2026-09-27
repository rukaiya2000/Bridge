"""Sync API. Run: uv run --group api uvicorn api.main:app --reload

Stores aggregates in MongoDB (api/db.py). Needs MONGODB_URI (an Atlas connection string) in .env.
Everything except /health, /auth/signup and /auth/login needs "Authorization: Bearer <token>" (api/auth.py).
Load the demo weeks into your account (TOKEN from /auth/login):
  for f in sample_prev_week sample_week; do curl -X POST localhost:8000/sync -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data @api/fixtures/$f.json; done
"""

import logging
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import ConnectionFailure
from pymongo.database import Database

from api import auth
from api import db as store
from api.auth import CurrentSession
from api.models import Credentials, LoginResult, Me, Starter, SyncPayload, ToolRating, TopicTrend, WeekSummary


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = store.connect()
    app.state.db = store.database(client)
    store.ensure_schema(app.state.db)
    auth.ensure_schema(app.state.db)
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


@app.exception_handler(ConnectionFailure)
def mongo_unreachable(request: Request, exc: ConnectionFailure) -> JSONResponse:
    """MongoDB can't be reached (wrong MONGODB_URI, or this IP isn't in Atlas → Network Access)."""
    log.error("MongoDB unreachable: %s", exc)
    return JSONResponse(
        {"detail": "The API can't reach MongoDB. Check MONGODB_URI in .env and that your IP is allowed in Atlas → Network Access."},
        status_code=503,
    )


def get_db(request: Request) -> Database:
    return request.app.state.db


Db = Annotated[Database, Depends(get_db)]


@app.get("/health")
def health(db: Db) -> dict:
    db.command("ping")
    return {"ok": True}


@app.post("/auth/signup")
def signup(body: Credentials, db: Db) -> LoginResult:
    return LoginResult(token=auth.signup(db, body.email, body.password), email=body.email.lower())


@app.post("/auth/login")
def login(body: Credentials, db: Db) -> LoginResult:
    return LoginResult(token=auth.login(db, body.email, body.password), email=body.email.lower())


@app.post("/auth/logout")
def logout(session: CurrentSession, db: Db) -> dict:
    auth.logout(db, session.token)
    return {"ok": True}


@app.post("/auth/session")
def extra_session(session: CurrentSession, db: Db) -> LoginResult:
    """The extension picks up the dashboard's login in the same browser: it trades the dashboard's
    token for its own (extension/src/content/dashboard.ts)."""
    return LoginResult(token=auth.extra_session(db, session.account_id), email=_email(db, session.account_id))


def _email(db: Database, account_id: str) -> str:
    return db.accounts.find_one({"_id": ObjectId(account_id)})["email"]


@app.get("/auth/me")
def me(session: CurrentSession, db: Db) -> Me:
    return Me(email=_email(db, session.account_id))


@app.post("/sync")
def sync(payload: SyncPayload, session: CurrentSession, db: Db) -> dict:
    log.info(
        "sync account=%s child=%s week=%s sites=%s topics=%s",
        session.account_id,
        payload.child_id,
        payload.week_start,
        [(s.site, s.level, round(s.score, 1)) for s in payload.sites],
        dict(sum((Counter({t.topic: t.count}) for t in payload.hourly_topics), Counter())),
    )
    store.save_week(db, session.account_id, payload)
    return {"stored": True}


@app.get("/children/{child_id}/weeks")
def weeks(child_id: str, session: CurrentSession, db: Db) -> list[str]:
    """Week starts with data, newest first."""
    return store.list_weeks(db, session.account_id, child_id)


@app.get("/children/{child_id}/weeks/{week_start}")
def week(child_id: str, week_start: date, session: CurrentSession, db: Db) -> WeekSummary:
    found = store.load_week(db, session.account_id, child_id, week_start)
    if found is None:
        raise HTTPException(404, "no data for that week")
    return found


@app.get("/children/{child_id}/weeks/{week_start}/topics")
def topics(child_id: str, week_start: date, session: CurrentSession, db: Db) -> list[TopicTrend]:
    """Per-topic counts this week vs last week, most frequent first."""
    return store.topic_trend(db, session.account_id, child_id, week_start)


@app.get("/tools/ratings")
def ratings(db: Db) -> list[ToolRating]:
    return store.tool_ratings(db)


@app.get("/starters")
def list_starters(db: Db) -> list[Starter]:
    return store.starters(db)
