import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import WriteError

from api.conftest import log_in
from api.main import app

# Same file the dashboard falls back to and the README's seed command posts.
PAYLOAD = json.loads((Path(__file__).parent / "fixtures" / "sample_week.json").read_text())
WEEK = "/children/demo/weeks/2026-09-01"


def test_sync_roundtrip(client):
    assert client.post("/sync", json=PAYLOAD).status_code == 200
    got = client.get(WEEK).json()
    by_site = lambda sites: sorted(sites, key=lambda x: x["site"])
    assert by_site(got["sites"]) == by_site(PAYLOAD["sites"])
    assert got["devices"] == 1
    key = lambda t: (t["date"], t["hour"], t["topic"])
    assert sorted(got["hourly_topics"], key=key) == sorted(PAYLOAD["hourly_topics"], key=key)
    assert got["voice_sessions"] == PAYLOAD["voice_sessions"]
    assert got["privacy_flags"] == PAYLOAD["privacy_flags"]


def test_activity_resync_replaces_only_that_devices_log(client):
    mic = {"date": "2026-09-02", "hour": 23, "site": "gemini", "minutes": 5}
    client.post("/sync", json={**_device("laptop"), "voice_sessions": [mic]})
    client.post("/sync", json={**_device("chromebook"), "voice_sessions": [{**mic, "minutes": 9}]})
    client.post("/sync", json={**_device("laptop"), "voice_sessions": [mic, {**mic, "hour": 1, "date": "2026-09-03"}]})
    got = client.get("/children/teen/weeks/2026-09-01").json()["voice_sessions"]
    assert sorted(v["minutes"] for v in got) == [5, 5, 9]
    old = _device("tablet")  # older extensions send no activity log
    assert client.post("/sync", json=old).status_code == 200


def test_privacy_flags_hold_kinds_never_values(client):
    flag = {"date": "2026-09-02", "hour": 10, "site": "gemini", "what": "message", "findings": ["phone"], "sent": True}
    assert client.post("/sync", json={**PAYLOAD, "privacy_flags": [{**flag, "value": "305-555-0100"}]}).status_code == 422
    assert client.post("/sync", json={**PAYLOAD, "privacy_flags": [{**flag, "findings": ["305-555-0100"]}]}).status_code == 422
    assert client.post("/sync", json={**PAYLOAD, "privacy_flags": [{**flag, "date": "2026-09-09"}]}).status_code == 422
    doc = {"account_id": "a", "child_id": "demo", "device_id": "d", "week_start": "2026-09-01", "kind": "privacy",
           "date": "2026-09-02", "hour": 10, "site": "gemini", "synced_at": datetime.now(timezone.utc), "value": "305-555-0100"}
    with pytest.raises(WriteError):
        app.state.db.activity.insert_one(doc)


def test_data_survives_restart(client):
    client.post("/sync", json=PAYLOAD)
    with TestClient(app, headers=client.headers) as restarted:
        assert restarted.get(WEEK).status_code == 200


def test_resync_replaces_the_week(client):
    client.post("/sync", json=PAYLOAD)
    fewer = {**PAYLOAD, "hourly_topics": PAYLOAD["hourly_topics"][:1]}
    client.post("/sync", json=fewer)
    assert client.get(WEEK).json()["hourly_topics"] == fewer["hourly_topics"]


def test_missing_week_is_404(client):
    assert client.get("/children/demo/weeks/2020-01-06").status_code == 404


def test_weeks_newest_first(client):
    later = {**PAYLOAD, "week_start": "2026-09-08", "hourly_topics": [], "voice_sessions": [], "privacy_flags": []}
    client.post("/sync", json=later)
    client.post("/sync", json=PAYLOAD)
    assert client.get("/children/demo/weeks").json() == ["2026-09-08", "2026-09-01"]
    assert client.get("/children/nobody/weeks").json() == []


def test_privacy_pauses_round_trip_and_default_to_zero(client):
    week = {**PAYLOAD, "sites": [{**PAYLOAD["sites"][0], "privacy_pauses": 3}]}
    client.post("/sync", json=week)
    assert client.get(WEEK).json()["sites"][0]["privacy_pauses"] == 3
    old = {**PAYLOAD, "sites": [{k: v for k, v in PAYLOAD["sites"][0].items() if k != "privacy_pauses"}]}
    client.post("/sync", json=old)  # older extensions don't send the field
    assert client.get(WEEK).json()["sites"][0]["privacy_pauses"] == 0


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
    doc = {"account_id": "a", "child_id": "demo", "device_id": "d", "week_start": "2026-09-01", "site": "gemini", "level": "watch",
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


def test_topic_trend_compares_with_last_week(client):
    prev = json.loads((Path(__file__).parent / "fixtures" / "sample_prev_week.json").read_text())
    client.post("/sync", json=prev)
    client.post("/sync", json=PAYLOAD)
    trend = {t["topic"]: t for t in client.get(WEEK + "/topics").json()}
    assert trend["loneliness"] == {"topic": "loneliness", "this_week": 6, "last_week": 2, "late_night": 5}
    assert trend["school"]["last_week"] == 4
    assert list(trend)[0] == "loneliness"  # most frequent first


def test_every_site_has_a_curated_rating(client):
    sites = {r["site"] for r in client.get("/tools/ratings").json()}
    assert sites == {"chatgpt", "claude", "characterai", "gemini"}


def test_starters_include_a_default(client):
    topics = {s["topic"] for s in client.get("/starters").json()}
    assert "default" in topics and "loneliness" in topics


def _device(device_id: str, site: str = "gemini", **fields) -> dict:
    base = {"site": site, "level": "healthy", "score": 1.0, "active_minutes": 10, "late_night_sessions": 0,
            "voice_minutes": 0, "nudges_shown": 0, "privacy_pauses": 0, "paid_tier": None}
    return {"child_id": "teen", "device_id": device_id, "week_start": "2026-09-01",
            "sites": [{**base, **fields}], "hourly_topics": []}


def test_devices_of_one_child_add_up(client):
    client.post("/sync", json=_device("laptop", active_minutes=30, late_night_sessions=1, nudges_shown=1, level="watch", score=4.0))
    client.post("/sync", json=_device("chromebook", active_minutes=45, late_night_sessions=2, level="concerning", score=8.5, paid_tier=True))
    week = client.get("/children/teen/weeks/2026-09-01").json()
    assert week["devices"] == 2
    assert week["sites"] == [{
        "site": "gemini", "level": "concerning", "score": 8.5,  # highest across devices, not added
        "active_minutes": 75, "late_night_sessions": 3, "voice_minutes": 0, "nudges_shown": 1, "privacy_pauses": 0,
        "paid_tier": True,
    }]


def test_a_device_resync_replaces_only_its_own_data(client):
    client.post("/sync", json=_device("laptop", active_minutes=30))
    client.post("/sync", json=_device("chromebook", active_minutes=45))
    client.post("/sync", json=_device("laptop", active_minutes=35))  # laptop's newer snapshot
    assert client.get("/children/teen/weeks/2026-09-01").json()["sites"][0]["active_minutes"] == 80


def test_hourly_topics_from_devices_add_up(client):
    hour = {"date": "2026-09-02", "hour": 23, "topic": "loneliness", "count": 2}
    client.post("/sync", json={**_device("laptop"), "hourly_topics": [hour]})
    client.post("/sync", json={**_device("chromebook"), "hourly_topics": [{**hour, "count": 3}]})
    assert client.get("/children/teen/weeks/2026-09-01").json()["hourly_topics"] == [{**hour, "count": 5}]
    trend = client.get("/children/teen/weeks/2026-09-01/topics").json()
    assert trend[0]["this_week"] == 5



def test_data_needs_a_login(anon):
    assert anon.post("/sync", json=PAYLOAD).status_code == 401
    assert anon.get("/children/demo/weeks").status_code == 401
    assert anon.get("/children/demo/weeks", headers={"authorization": "Bearer made-up"}).status_code == 401
    assert anon.get("/tools/ratings").status_code == 200  # curated, not personal


def test_testers_with_the_same_child_id_dont_share_data(anon):
    alice = log_in(anon, "alice@example.com").headers["authorization"]
    bob = log_in(anon, "bob@example.com").headers["authorization"]
    anon.post("/sync", json=PAYLOAD, headers={"authorization": alice})
    assert anon.get(WEEK, headers={"authorization": alice}).status_code == 200
    assert anon.get(WEEK, headers={"authorization": bob}).status_code == 404
    assert anon.get("/children/demo/weeks", headers={"authorization": bob}).json() == []
    assert anon.get(WEEK + "/topics", headers={"authorization": bob}).json() == []


def test_signup_login_logout(anon):
    creds = {"email": "Parent@Example.com", "password": "correct horse"}
    assert anon.post("/auth/signup", json=creds).status_code == 200
    assert anon.post("/auth/signup", json=creds).status_code == 409
    assert anon.post("/auth/login", json={**creds, "password": "wrong horse"}).status_code == 401
    assert anon.post("/auth/login", json={**creds, "email": "nobody@example.com"}).status_code == 401
    token = anon.post("/auth/login", json={**creds, "email": "parent@example.com"}).json()["token"]
    headers = {"authorization": f"Bearer {token}"}
    assert anon.get("/auth/me", headers=headers).json() == {"email": "parent@example.com"}
    anon.post("/auth/logout", headers=headers)
    assert anon.get("/auth/me", headers=headers).status_code == 401


def test_passwords_are_hashed(client):
    stored = app.state.db.accounts.find_one({"email": "tester@example.com"})
    assert "correct horse" not in str(stored) and stored["password_hash"].startswith("$argon2")


def test_new_feelings_sync(client):
    feelings = ["hopelessness", "emptiness", "rejection", "guilt_shame", "overwhelm", "fear", "grief", "jealousy",
                "frustration", "happiness"]
    week = {**PAYLOAD, "hourly_topics": [{"date": "2026-09-02", "hour": 20, "topic": f, "count": 1} for f in feelings]}
    assert client.post("/sync", json=week).status_code == 200
    assert {t["topic"] for t in client.get(WEEK + "/topics").json()} == set(feelings)


def test_unreachable_mongo_is_a_clear_503(anon, monkeypatch):
    from pymongo.errors import ServerSelectionTimeoutError

    def down(*a, **k):
        raise ServerSelectionTimeoutError("no servers")
    monkeypatch.setattr("api.auth.login", down)
    res = TestClient(app, raise_server_exceptions=False).post("/auth/login", json={"email": "a@example.com", "password": "correct horse"})
    assert res.status_code == 503 and "MongoDB" in res.json()["detail"]


def test_extension_gets_its_own_session_from_the_dashboards(client):
    dashboard = client.headers["authorization"]
    res = client.post("/auth/session")
    assert res.json()["email"] == "tester@example.com"
    extension = {"authorization": f"Bearer {res.json()['token']}"}
    client.post("/auth/logout")  # dashboard logs out
    assert client.get("/auth/me", headers={"authorization": dashboard}).status_code == 401
    assert client.get("/auth/me", headers=extension).status_code == 200  # extension still logged in


def test_oversized_or_duplicated_syncs_are_rejected(client):
    row = {"date": "2026-09-03", "hour": 1, "topic": "school", "count": 1}
    too_many = {**PAYLOAD, "hourly_topics": [{**row, "hour": h % 24, "date": f"2026-09-0{1 + h // 24 % 7}"} for h in range(3000)]}
    assert client.post("/sync", json=too_many).status_code == 422
    assert client.post("/sync", json={**PAYLOAD, "hourly_topics": [row, row]}).status_code == 422
    assert client.post("/sync", json={**PAYLOAD, "sites": PAYLOAD["sites"] * 2}).status_code == 422
    assert client.post("/sync", json={**PAYLOAD, "hourly_topics": [{**row, "count": 1_000_000}]}).status_code == 422


def test_voice_sessions_and_privacy_flags_are_capped(client):
    voice = {"date": "2026-09-03", "hour": 1, "site": "gemini", "minutes": 5}
    flag = {"date": "2026-09-03", "hour": 1, "site": "gemini", "what": "message", "findings": ["card"], "sent": False}
    assert client.post("/sync", json={**PAYLOAD, "voice_sessions": [voice] * 1000}).status_code == 422
    assert client.post("/sync", json={**PAYLOAD, "privacy_flags": [flag] * 1001}).status_code == 422
    assert client.post("/sync", json={**PAYLOAD, "voice_sessions": [{**voice, "minutes": 100_000}]}).status_code == 422
    assert client.post("/sync", json={**PAYLOAD, "voice_sessions": [voice], "privacy_flags": [flag]}).status_code == 200
