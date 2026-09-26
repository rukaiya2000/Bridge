"""MongoDB storage for the sync API. Only aggregates reach this layer: models.py rejects unknown
fields, and the weekly_aggregates validator below rejects them again at the database.

  weekly_aggregates  one document per account, child, device, week and site (level, score, hours, ...)
  hourly_topics      time-series collection of topic counts per hour
  activity           mic uses and personal-info flags (kinds of info only), one document each
  tool_ratings       hand-curated rating per AI site      (seeded from api/fixtures/tool_ratings.json)
  starters           vetted conversation starters         (seeded from api/fixtures/starters.json)

Both expire RETENTION after they were written (TTL), so old data is deleted by MongoDB itself.
Every read and write is scoped to the logged-in account (api/auth.py), so testers never share data.
"""

import json
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import get_args

from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne
from pymongo.database import Database
from pymongo.errors import CollectionInvalid

from api.models import Finding, Level, Site, Starter, SyncPayload, ToolRating, TopicTrend, WeekSummary

load_dotenv()  # MONGODB_URI / MONGODB_DB from the repo's .env, if present

RETENTION = timedelta(weeks=8)
FIXTURES = Path(__file__).parent / "fixtures"

# Second guard next to the API's pydantic models: no extra fields (so no message text) can be stored.
WEEKLY_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "additionalProperties": False,
        "required": ["account_id", "child_id", "device_id", "week_start", "site", "level", "score", "synced_at"],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "account_id": {"bsonType": "string"},
            "child_id": {"bsonType": "string"},
            "device_id": {"bsonType": "string"},
            "week_start": {"bsonType": "string"},
            "site": {"enum": list(get_args(Site))},
            "level": {"enum": list(get_args(Level))},
            "score": {"bsonType": ["double", "int"]},
            "active_minutes": {"bsonType": "int", "minimum": 0},
            "late_night_sessions": {"bsonType": "int", "minimum": 0},
            "voice_minutes": {"bsonType": "int", "minimum": 0},
            "nudges_shown": {"bsonType": "int", "minimum": 0},
            "privacy_pauses": {"bsonType": "int", "minimum": 0},
            "paid_tier": {"bsonType": ["bool", "null"]},
            "synced_at": {"bsonType": "date"},
        },
    }
}

# Same guard for the activity log: timing and kinds of info, never values or text.
ACTIVITY_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "additionalProperties": False,
        "required": ["account_id", "child_id", "device_id", "week_start", "kind", "date", "hour", "site", "synced_at"],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "account_id": {"bsonType": "string"},
            "child_id": {"bsonType": "string"},
            "device_id": {"bsonType": "string"},
            "week_start": {"bsonType": "string"},
            "kind": {"enum": ["voice", "privacy"]},
            "date": {"bsonType": "string"},
            "hour": {"bsonType": "int", "minimum": 0, "maximum": 23},
            "site": {"enum": list(get_args(Site))},
            "minutes": {"bsonType": "int", "minimum": 0},
            "what": {"enum": ["message", "file"]},
            "findings": {"bsonType": "array", "items": {"enum": list(get_args(Finding))}},
            "sent": {"bsonType": "bool"},
            "synced_at": {"bsonType": "date"},
        },
    }
}


def connect() -> MongoClient:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is not set. Put your Atlas connection string in .env (see .env.example).")
    # Fail in 5 s instead of pymongo's default 30 s, so an unreachable Atlas shows up as an error, not a hang.
    return MongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=5000)


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
    for name, validator in (("weekly_aggregates", WEEKLY_VALIDATOR), ("activity", ACTIVITY_VALIDATOR)):
        try:
            db.create_collection(name, validator=validator)
        except CollectionInvalid:
            db.command("collMod", name, validator=validator)
    db.activity.create_index([("account_id", 1), ("child_id", 1), ("week_start", 1), ("device_id", 1)])
    db.activity.create_index("synced_at", expireAfterSeconds=ttl)
    # Before device ids, one document per child/week/site. Label those rows as one "legacy" device
    # and replace the old unique index, which would stop two devices reporting the same site.
    db.weekly_aggregates.update_many({"device_id": {"$exists": False}}, {"$set": {"device_id": "legacy"}})
    db.hourly_topics.update_many({"meta.device_id": {"$exists": False}}, {"$set": {"meta.device_id": "legacy"}})
    # Rows synced before accounts belong to no one; park them under "legacy" (TTL deletes them later).
    db.weekly_aggregates.update_many({"account_id": {"$exists": False}}, {"$set": {"account_id": "legacy"}})
    db.hourly_topics.update_many({"meta.account_id": {"$exists": False}}, {"$set": {"meta.account_id": "legacy"}})
    for old in ("child_id_1_week_start_1_site_1", "child_id_1_week_start_1_site_1_device_id_1"):
        if old in db.weekly_aggregates.index_information():
            db.weekly_aggregates.drop_index(old)
    db.weekly_aggregates.create_index(
        [("account_id", 1), ("child_id", 1), ("week_start", 1), ("site", 1), ("device_id", 1)], unique=True)
    db.weekly_aggregates.create_index("synced_at", expireAfterSeconds=ttl)
    _seed(db, "tool_ratings", "tool_ratings.json", ToolRating, key="site")
    _seed(db, "starters", "starters.json", Starter, key="topic")


def _seed(db: Database, collection: str, fixture: str, model, key: str) -> None:
    """Upserts the curated JSON into MongoDB, so editing the file and restarting updates it."""
    rows = [model.model_validate(r).model_dump() for r in json.loads((FIXTURES / fixture).read_text())]
    db[collection].create_index(key, unique=True)
    if rows:
        db[collection].bulk_write([UpdateOne({key: r[key]}, {"$set": r}, upsert=True) for r in rows])
    db[collection].delete_many({key: {"$nin": [r[key] for r in rows]}})


def _week_range(week_start: date) -> tuple[datetime, datetime]:
    start = datetime.combine(week_start, time(), timezone.utc)
    return start, start + timedelta(days=7)


def save_week(db: Database, account_id: str, p: SyncPayload) -> None:
    """Stores one device's snapshot of a child's week, replacing that device's earlier sync only.
    Other devices' data for the same child is left alone and added up when read (load_week)."""
    week = p.week_start.isoformat()
    now = datetime.now(timezone.utc)
    key = {"account_id": account_id, "child_id": p.child_id, "device_id": p.device_id, "week_start": week}
    ops = [
        UpdateOne({**key, "site": s.site}, {"$set": {**s.model_dump(), "synced_at": now}}, upsert=True)
        for s in p.sites
    ]
    if ops:
        db.weekly_aggregates.bulk_write(ops)
    db.weekly_aggregates.delete_many({**key, "site": {"$nin": [s.site for s in p.sites]}})

    start, end = _week_range(p.week_start)
    db.hourly_topics.delete_many(
        {"meta.account_id": account_id, "meta.child_id": p.child_id, "meta.device_id": p.device_id, "ts": {"$gte": start, "$lt": end}})
    if p.hourly_topics:
        db.hourly_topics.insert_many([
            {
                "ts": datetime.combine(t.date, time(hour=t.hour), timezone.utc),
                "meta": {"account_id": account_id, "child_id": p.child_id, "device_id": p.device_id, "topic": t.topic},
                "count": t.count,
            }
            for t in p.hourly_topics
        ])

    db.activity.delete_many(key)
    rows = [{**v.model_dump(), "kind": "voice"} for v in p.voice_sessions]
    rows += [{**f.model_dump(), "kind": "privacy"} for f in p.privacy_flags]
    if rows:
        db.activity.insert_many([{**r, **key, "date": r["date"].isoformat(), "synced_at": now} for r in rows])


def list_weeks(db: Database, account_id: str, child_id: str) -> list[str]:
    query = {"account_id": account_id, "child_id": child_id}
    return sorted(db.weekly_aggregates.distinct("week_start", query), reverse=True)


LEVELS = list(get_args(Level))  # healthy < watch < concerning < crisis


def load_week(db: Database, account_id: str, child_id: str, week_start: date) -> WeekSummary | None:
    """The child's week with every device added up: minutes and counts are summed, the level and
    score are the highest any device reported (levels can't be added), paid if any device is paid."""
    week = week_start.isoformat()
    per_site = list(db.weekly_aggregates.aggregate([
        {"$match": {"account_id": account_id, "child_id": child_id, "week_start": week}},
        {"$group": {
            "_id": "$site",
            "level_rank": {"$max": {"$indexOfArray": [LEVELS, "$level"]}},
            "score": {"$max": "$score"},
            "active_minutes": {"$sum": "$active_minutes"},
            "late_night_sessions": {"$sum": "$late_night_sessions"},
            "voice_minutes": {"$sum": "$voice_minutes"},
            "nudges_shown": {"$sum": "$nudges_shown"},
            "privacy_pauses": {"$sum": "$privacy_pauses"},
            "paid": {"$push": "$paid_tier"},
            "devices": {"$addToSet": "$device_id"},
        }},
        {"$sort": {"_id": 1}},
    ]))
    if not per_site:
        return None
    devices = set().union(*(r["devices"] for r in per_site))
    sites = [{
        "site": r["_id"], "level": LEVELS[r["level_rank"]], "score": r["score"],
        "active_minutes": r["active_minutes"], "late_night_sessions": r["late_night_sessions"],
        "voice_minutes": r["voice_minutes"], "nudges_shown": r["nudges_shown"], "privacy_pauses": r["privacy_pauses"],
        "paid_tier": True if True in r["paid"] else (False if False in r["paid"] else None),
    } for r in per_site]

    start, end = _week_range(week_start)
    # Let MongoDB add up the devices' counts and turn timestamps back into date + hour.
    hourly = list(db.hourly_topics.aggregate([
        {"$match": {"meta.account_id": account_id, "meta.child_id": child_id, "ts": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": {"ts": "$ts", "topic": "$meta.topic"}, "count": {"$sum": "$count"}}},
        {"$sort": {"_id.ts": 1, "_id.topic": 1}},
        {"$project": {
            "_id": 0,
            "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$_id.ts"}},
            "hour": {"$hour": "$_id.ts"},
            "topic": "$_id.topic",
            "count": 1,
        }},
    ]))
    activity = list(db.activity.find(
        {"account_id": account_id, "child_id": child_id, "week_start": week},
        {"_id": 0, "account_id": 0, "child_id": 0, "device_id": 0, "week_start": 0, "synced_at": 0},
    ).sort([("date", 1), ("hour", 1)]))
    voice = [{k: v for k, v in a.items() if k != "kind"} for a in activity if a["kind"] == "voice"]
    privacy = [{k: v for k, v in a.items() if k != "kind"} for a in activity if a["kind"] == "privacy"]
    return WeekSummary(child_id=child_id, week_start=week_start, devices=len(devices), sites=sites, hourly_topics=hourly,
                       voice_sessions=voice, privacy_flags=privacy)


def topic_trend(db: Database, account_id: str, child_id: str, week_start: date) -> list[TopicTrend]:
    """Topic counts this week vs last week, plus this week's late-night count, in one aggregation."""
    start, end = _week_range(week_start)
    prev = start - timedelta(days=7)
    this_week = {"$gte": ["$ts", start]}
    late = {"$or": [{"$gte": [{"$hour": "$ts"}, 23]}, {"$lt": [{"$hour": "$ts"}, 5]}]}
    rows = db.hourly_topics.aggregate([
        {"$match": {"meta.account_id": account_id, "meta.child_id": child_id, "ts": {"$gte": prev, "$lt": end}}},
        {"$group": {
            "_id": "$meta.topic",
            "this_week": {"$sum": {"$cond": [this_week, "$count", 0]}},
            "last_week": {"$sum": {"$cond": [this_week, 0, "$count"]}},
            "late_night": {"$sum": {"$cond": [{"$and": [this_week, late]}, "$count", 0]}},
        }},
        {"$sort": {"this_week": -1, "last_week": -1, "_id": 1}},
        {"$project": {"_id": 0, "topic": "$_id", "this_week": 1, "last_week": 1, "late_night": 1}},
    ])
    return [TopicTrend(**r) for r in rows]


def tool_ratings(db: Database) -> list[ToolRating]:
    return [ToolRating(**r) for r in db.tool_ratings.find({}, {"_id": 0}).sort("site")]


def starters(db: Database) -> list[Starter]:
    return [Starter(**r) for r in db.starters.find({}, {"_id": 0}).sort("topic")]
