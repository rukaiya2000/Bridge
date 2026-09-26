import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import WriteError

from api.main import app

# Same file the dashboard falls back to and the README's seed command posts.
PAYLOAD = json.loads((Path(__file__).parent / "fixtures" / "sample_week.json").read_text())
WEEK = "/children/demo/weeks/2026-09-01"


def test_sync_roundtrip(client):
    assert client.post("/sync", json=PAYLOAD).status_code == 200
    got = client.get(WEEK).json()
    assert got["sites"] == [{**PAYLOAD["sites"][0]}]
    key = lambda t: (t["date"], t["hour"], t["topic"])
    assert sorted(got["hourly_topics"], key=key) == sorted(PAYLOAD["hourly_topics"], key=key)


def test_data_survives_restart(client):
    client.post("/sync", json=PAYLOAD)
    with TestClient(app) as restarted:
        assert restarted.get(WEEK).status_code == 200


def test_resync_replaces_the_week(client):
    client.post("/sync", json=PAYLOAD)
    fewer = {**PAYLOAD, "hourly_topics": PAYLOAD["hourly_topics"][:1]}
    client.post("/sync", json=fewer)
    assert client.get(WEEK).json()["hourly_topics"] == fewer["hourly_topics"]


def test_missing_week_is_404(client):
    assert client.get("/children/demo/weeks/2020-01-06").status_code == 404


def test_weeks_newest_first(client):
    later = {**PAYLOAD, "week_start": "2026-09-08", "hourly_topics": []}
    client.post("/sync", json=later)
    client.post("/sync", json=PAYLOAD)
    assert client.get("/children/demo/weeks").json() == ["2026-09-08", "2026-09-01"]
    assert client.get("/children/nobody/weeks").json() == []


def test_rejects_text_fields(client):
    bad = {**PAYLOAD, "sites": [{**PAYLOAD["sites"][0], "text": "you get me better than anyone"}]}
    assert client.post("/sync", json=bad).status_code == 422


def test_rejects_excluded_topics(client):
    bad = {**PAYLOAD, "hourly_topics": [{"date": "2026-09-03", "hour": 1, "topic": "religion", "count": 1}]}
    assert client.post("/sync", json=bad).status_code == 422


def test_rejects_topics_outside_the_week(client):
    bad = {**PAYLOAD, "hourly_topics": [{"date": "2026-09-09", "hour": 1, "topic": "school", "count": 1}]}
    assert client.post("/sync", json=bad).status_code == 422


def test_database_rejects_text_even_without_the_api(client):
    doc = {"child_id": "demo", "week_start": "2026-09-01", "site": "gemini", "level": "watch",
           "score": 1.0, "synced_at": datetime.now(timezone.utc), "text": "a message"}
    with pytest.raises(WriteError):
        app.state.db.weekly_aggregates.insert_one(doc)


def test_old_data_expires(client):
    ttl = {tuple(i["key"].keys())[0]: i.get("expireAfterSeconds") for i in app.state.db.weekly_aggregates.list_indexes()}
    assert ttl["synced_at"] == 8 * 7 * 24 * 3600
    opts = app.state.db.command("listCollections", filter={"name": "hourly_topics"})["cursor"]["firstBatch"][0]["options"]
    assert opts["expireAfterSeconds"] == 8 * 7 * 24 * 3600
    assert opts["timeseries"]["timeField"] == "ts"


def test_cors_allows_any_local_port(client):
    res = client.get("/health", headers={"origin": "http://localhost:5174"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:5174"
    assert "access-control-allow-origin" not in client.get("/health", headers={"origin": "https://evil.example"}).headers
