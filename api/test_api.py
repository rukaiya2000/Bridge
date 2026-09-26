import json
from pathlib import Path

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)

# Same file the dashboard falls back to and the README's seed command posts.
PAYLOAD = json.loads((Path(__file__).parent / "fixtures" / "sample_week.json").read_text())


def test_sync_roundtrip():
    assert client.post("/sync", json=PAYLOAD).status_code == 200
    assert client.get("/children/demo/weeks/2026-09-01").json()["sites"][0]["level"] == "concerning"


def test_weeks_newest_first():
    client.post("/sync", json={**PAYLOAD, "week_start": "2026-09-08"})
    client.post("/sync", json=PAYLOAD)
    assert client.get("/children/demo/weeks").json()[:2] == ["2026-09-08", "2026-09-01"]
    assert client.get("/children/nobody/weeks").json() == []


def test_cors_allows_any_local_port():
    res = client.get("/health", headers={"origin": "http://localhost:5174"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:5174"
    assert "access-control-allow-origin" not in client.get("/health", headers={"origin": "https://evil.example"}).headers


def test_rejects_text_fields():
    bad = {**PAYLOAD, "sites": [{**PAYLOAD["sites"][0], "text": "you get me better than anyone"}]}
    assert client.post("/sync", json=bad).status_code == 422


def test_rejects_excluded_topics():
    bad = {**PAYLOAD, "hourly_topics": [{"date": "2026-09-03", "hour": 1, "topic": "religion", "count": 1}]}
    assert client.post("/sync", json=bad).status_code == 422
