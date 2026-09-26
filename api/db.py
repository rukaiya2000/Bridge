"""MongoDB storage for the sync API. Only aggregates reach this layer: models.py rejects unknown
fields, and the weekly_aggregates validator below rejects them again at the database.

  weekly_aggregates  one document per child, week and site (level, score, hours, ...)
  hourly_topics      time-series collection of topic counts per hour

Both expire RETENTION after they were written (TTL), so old data is deleted by MongoDB itself.
"""

import os
from datetime import date, datetime, time, timedelta, timezone
from typing import get_args

from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne
from pymongo.database import Database
from pymongo.errors import CollectionInvalid

from api.models import Level, Site, SyncPayload

load_dotenv()  # MONGODB_URI / MONGODB_DB from the repo's .env, if present

RETENTION = timedelta(weeks=8)

# Second guard next to the API's pydantic models: no extra fields (so no message text) can be stored.
WEEKLY_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "additionalProperties": False,
        "required": ["child_id", "week_start", "site", "level", "score", "synced_at"],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "child_id": {"bsonType": "string"},
            "week_start": {"bsonType": "string"},
            "site": {"enum": list(get_args(Site))},
            "level": {"enum": list(get_args(Level))},
            "score": {"bsonType": ["double", "int"]},
            "active_minutes": {"bsonType": "int", "minimum": 0},
            "late_night_sessions": {"bsonType": "int", "minimum": 0},
            "voice_minutes": {"bsonType": "int", "minimum": 0},
            "nudges_shown": {"bsonType": "int", "minimum": 0},
            "paid_tier": {"bsonType": ["bool", "null"]},
            "synced_at": {"bsonType": "date"},
        },
    }
}


def connect() -> MongoClient:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is not set. Put your Atlas connection string in .env (see .env.example).")
    return MongoClient(uri, tz_aware=True)


def database(client: MongoClient) -> Database:
    return client[os.environ.get("MONGODB_DB", "bridge")]


def ensure_schema(db: Database) -> None:
    """Creates collections and indexes if missing. Safe to run on every start."""
    ttl = int(RETENTION.total_seconds())
    try:
        db.create_collection(
            "hourly_topics",
            timeseries={"timeField": "ts", "metaField": "meta", "granularity": "hours"},
            expireAfterSeconds=ttl,
        )
    except CollectionInvalid:
        pass  # already exists
    try:
        db.create_collection("weekly_aggregates", validator=WEEKLY_VALIDATOR)
    except CollectionInvalid:
        db.command("collMod", "weekly_aggregates", validator=WEEKLY_VALIDATOR)
    db.weekly_aggregates.create_index([("child_id", 1), ("week_start", 1), ("site", 1)], unique=True)
    db.weekly_aggregates.create_index("synced_at", expireAfterSeconds=ttl)


def _week_range(week_start: date) -> tuple[datetime, datetime]:
    start = datetime.combine(week_start, time(), timezone.utc)
    return start, start + timedelta(days=7)


def save_week(db: Database, p: SyncPayload) -> None:
    """Stores a full snapshot of one child's week, replacing any earlier sync of that week."""
    week = p.week_start.isoformat()
    now = datetime.now(timezone.utc)
    key = {"child_id": p.child_id, "week_start": week}
    ops = [
        UpdateOne({**key, "site": s.site}, {"$set": {**s.model_dump(), "synced_at": now}}, upsert=True)
        for s in p.sites
    ]
    if ops:
        db.weekly_aggregates.bulk_write(ops)
    db.weekly_aggregates.delete_many({**key, "site": {"$nin": [s.site for s in p.sites]}})

    start, end = _week_range(p.week_start)
    db.hourly_topics.delete_many({"meta.child_id": p.child_id, "ts": {"$gte": start, "$lt": end}})
    if p.hourly_topics:
        db.hourly_topics.insert_many([
            {
                "ts": datetime.combine(t.date, time(hour=t.hour), timezone.utc),
                "meta": {"child_id": p.child_id, "topic": t.topic},
                "count": t.count,
            }
            for t in p.hourly_topics
        ])


def list_weeks(db: Database, child_id: str) -> list[str]:
    return sorted(db.weekly_aggregates.distinct("week_start", {"child_id": child_id}), reverse=True)


def load_week(db: Database, child_id: str, week_start: date) -> SyncPayload | None:
    week = week_start.isoformat()
    sites = list(db.weekly_aggregates.find(
        {"child_id": child_id, "week_start": week},
        {"_id": 0, "child_id": 0, "week_start": 0, "synced_at": 0},
    ).sort("site"))
    if not sites:
        return None
    start, end = _week_range(week_start)
    # Let MongoDB turn timestamps back into date + hour.
    hourly = list(db.hourly_topics.aggregate([
        {"$match": {"meta.child_id": child_id, "ts": {"$gte": start, "$lt": end}}},
        {"$sort": {"ts": 1, "meta.topic": 1}},
        {"$project": {
            "_id": 0,
            "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}},
            "hour": {"$hour": "$ts"},
            "topic": "$meta.topic",
            "count": 1,
        }},
    ]))
    return SyncPayload(child_id=child_id, week_start=week_start, sites=sites, hourly_topics=hourly)
