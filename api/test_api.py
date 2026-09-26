from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)

PAYLOAD = {
    "child_id": "demo",
    "week_start": "2026-09-01",
    "sites": [{"site": "gemini", "level": "concerning", "score": 10.6, "active_minutes": 300,
               "late_night_sessions": 4, "voice_minutes": 25, "nudges_shown": 2}],
    "hourly_topics": [{"date": "2026-09-03", "hour": 23, "topic": "loneliness", "count": 2}],
}


def test_sync_roundtrip():
    assert client.post("/sync", json=PAYLOAD).status_code == 200
    assert client.get("/children/demo/weeks/2026-09-01").json()["sites"][0]["level"] == "concerning"


def test_rejects_text_fields():
    bad = {**PAYLOAD, "sites": [{**PAYLOAD["sites"][0], "text": "you get me better than anyone"}]}
    assert client.post("/sync", json=bad).status_code == 422


def test_rejects_excluded_topics():
    bad = {**PAYLOAD, "hourly_topics": [{"date": "2026-09-03", "hour": 1, "topic": "religion", "count": 1}]}
    assert client.post("/sync", json=bad).status_code == 422
