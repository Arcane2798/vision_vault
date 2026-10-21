"""Incidents, dashboard, security, status, guard alerts."""
import time
from datetime import date, datetime, timedelta

import pytest

from conftest import add_event, sql


# ---------- incidents ----------
def test_incident_mapping_unknown(client):
    eid = add_event(clip_path="clips/a.mp4", snapshot_path="snapshots/a.jpg",
                    guard_notified=True)
    i = client.get(f"/api/incidents/{eid}").json()
    assert i["id"] == str(eid) and i["cameraId"] == "cam-01"
    assert i["cameraName"] == "Camera #1: Front Door" and i["location"] == "Front Door"
    assert i["label"] == "intrusion" and i["identity"] == "unknown"
    assert i["status"] == "new" and i["confidence"] == 1.0
    assert i["timestamp"].endswith("Z")
    assert i["clipUrl"].endswith("/clips/a.mp4") and i["snapshotUrl"].endswith("/snapshots/a.jpg")
    assert i["clipReady"] is False and i["guardNotified"] is True
    assert i["guardAcknowledgedAt"] is None and i["guardAckNote"] is None
    assert "notes" not in i and "reviewedAt" not in i


def test_incident_visitor_identity_and_no_clip(client):
    eid = add_event("Ali", "guest_outside_window")
    i = client.get(f"/api/incidents/{eid}").json()
    assert i["identity"] == "Ali" and i["label"] == "guest_outside_window"
    assert "clipUrl" not in i and "snapshotUrl" not in i
    assert i["clipReady"] is False and i["guardNotified"] is False


def test_clip_ready_flag(client):
    eid = add_event(clip_path="clips/b.mp4")
    sql("UPDATE events SET clip_ready=1 WHERE id=?", (eid,))
    assert client.get(f"/api/incidents/{eid}").json()["clipReady"] is True


def test_clip_ready_needs_clip(client):
    eid = add_event()
    sql("UPDATE events SET clip_ready=1 WHERE id=?", (eid,))
    assert client.get(f"/api/incidents/{eid}").json()["clipReady"] is False


def test_incident_404(client):
    assert client.get("/api/incidents/999").status_code == 404


def test_incident_filters_and_sort(client):
    now = time.time()
    a = add_event(ts=now - 100)
    b = add_event("Ali", "guest_outside_window", ts=now)
    sql("UPDATE events SET status='confirmed' WHERE id=?", (a,))
    ids = [i["id"] for i in client.get("/api/incidents").json()]
    assert ids == [str(b), str(a)]
    ids = [i["id"] for i in client.get("/api/incidents?sort=oldest").json()]
    assert ids == [str(a), str(b)]
    assert [i["id"] for i in client.get("/api/incidents?search=ali").json()] == [str(b)]
    assert [i["id"] for i in client.get("/api/incidents?search=GUEST_OUT").json()] == [str(b)]
    assert [i["id"] for i in client.get("/api/incidents?status=confirmed").json()] == [str(a)]
    assert client.get("/api/incidents?cameraId=cam-02").json() == []
    assert len(client.get("/api/incidents?cameraId=cam-01").json()) == 2
    assert client.get("/api/incidents?from=2999-01-01").json() == []
    assert client.get("/api/incidents?to=2000-01-01").json() == []


def test_incident_date_filter_uses_local_day(client):
    today = date.today()
    early = datetime.combine(today, datetime.min.time()) + timedelta(hours=3)
    eid = add_event(ts=early.timestamp())
    d = today.isoformat()
    got = [i["id"] for i in client.get(f"/api/incidents?from={d}&to={d}").json()]
    assert got == [str(eid)]


def test_patch_incident(client):
    eid = add_event()
    r = client.patch(f"/api/incidents/{eid}", json={"status": "confirmed", "notes": "real"})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "confirmed" and j["notes"] == "real" and j["reviewedAt"].endswith("Z")
    assert client.patch(f"/api/incidents/{eid}", json={"status": "bogus"}).status_code == 422
    assert client.patch(f"/api/incidents/{eid}", json={}).status_code == 422
    assert client.patch("/api/incidents/999", json={"status": "dismissed"}).status_code == 404
    assert sql("SELECT status FROM events WHERE id=?", (eid,))[0][0] == "confirmed"


# ---------- dashboard ----------
def test_dashboard_summary(client, engine):
    now = time.time()
    a = add_event(ts=now)
    b = add_event(ts=now)
    add_event(ts=now - 3 * 86400)
    sql("UPDATE events SET status='dismissed' WHERE id=?", (a,))
    sql("UPDATE events SET status='under_review' WHERE id=?", (b,))
    s = client.get("/api/dashboard/summary").json()
    assert s == {"activeCameras": 1, "totalCameras": 1, "incidentsToday": 2,
                 "totalIncidents": 3, "unresolvedAlerts": 2, "awaitingGuard": 0}
    engine.running = False
    assert client.get("/api/dashboard/summary").json()["activeCameras"] == 0


def test_dashboard_trend(client):
    now = time.time()
    a = add_event(ts=now)
    add_event(ts=now)
    add_event(ts=now - 86400)
    sql("UPDATE events SET status='confirmed' WHERE id=?", (a,))
    pts = client.get("/api/dashboard/trend?days=3").json()
    assert len(pts) == 3
    assert pts[-1] == {"date": date.today().isoformat(), "potential": 1, "confirmed": 1}
    assert pts[-2]["potential"] == 1 and pts[0]["potential"] == 0
    assert len(client.get("/api/dashboard/trend").json()) == 14


# ---------- status / security ----------
def test_status_shape(client, engine):
    engine.in_view = [{"name": "Azhad", "kind": "family"}, {"name": "unknown", "kind": "unknown"}]
    s = client.get("/api/status").json()
    assert s == {"running": True, "fps": 5.2, "unknownCount": 1,
                 "cameraName": "Camera #1: Front Door", "securityLevel": "normal",
                 "peopleInView": engine.in_view}


def test_security_roundtrip(client):
    g = client.get("/api/security").json()
    assert g == {"level": "normal", "effectiveLevel": "normal", "highReason": None,
                 "night": {"enabled": False, "start": "23:00", "end": "06:00"},
                 "away": {"enabled": False, "from": None, "to": None},
                 "offUntil": None, "resumeLevel": "normal",
                 "updatedAt": None}
    p = client.put("/api/security", json={"level": "high",
                                          "night": {"start": "22:30"}}).json()
    assert p["level"] == "high" and p["effectiveLevel"] == "high"
    assert p["night"] == {"enabled": False, "start": "22:30", "end": "06:00"}
    assert p["updatedAt"].endswith("Z")
    assert client.get("/api/security").json() == p
    assert client.get("/api/status").json()["securityLevel"] == "high"


@pytest.mark.parametrize("body", [{"level": "party"}, {"level": "home"}, {"level": "away"},
                                  {"night": {"start": "25:00"}},
                                  {"night": {"end": "6:00"}}])
def test_security_400(client, body):
    assert client.put("/api/security", json=body).status_code == 400


def test_cameras(client):
    cams = client.get("/api/cameras").json()
    assert len(cams) == 1 and cams[0]["id"] == "cam-01" and cams[0]["status"] == "online"
    assert client.post("/api/cameras").status_code == 501
    assert client.delete("/api/cameras/cam-01").status_code == 501


# ---------- guard house ----------
def test_guard_alerts_list(client):
    now = time.time()
    a = add_event(ts=now - 10, guard_notified=True, snapshot_path="snapshots/s.jpg")
    add_event(ts=now - 5)                                       # guard_notified = 0: not a guard alert
    add_event("Ali", "guest_outside_window", ts=now - 1)
    b = add_event(ts=now, guard_notified=True)
    alerts = client.get("/api/guard/alerts").json()
    assert [x["id"] for x in alerts] == [str(b), str(a)]
    x = alerts[1]
    assert set(x) == {"id", "timestamp", "houseUnit", "cameraName", "snapshotUrl", "clipUrl", "items",
                      "clipReady", "acknowledgedAt", "ackNote"}
    assert x["houseUnit"] == "No. 12, Test Lane" and x["snapshotUrl"].endswith("/snapshots/s.jpg")
    assert x["clipUrl"] is None and x["clipReady"] is False and x["acknowledgedAt"] is None
    assert "identity" not in x
    assert len(client.get("/api/guard/alerts?limit=1").json()) == 1
    assert len(client.get("/api/guard/alerts?limit=0").json()) == 1      # clamped to 1


def test_guard_ack(client, sent):
    eid = add_event(guard_notified=True)
    r = client.post(f"/api/guard/alerts/{eid}/ack", json={"note": "Guard dispatched"})
    assert r.status_code == 200
    first = r.json()
    assert first["acknowledgedAt"].endswith("Z") and first["ackNote"] == "Guard dispatched"
    assert len(sent) == 1
    assert "Guard house acknowledged the alert at" in sent[0][0][0]
    assert sent[0][0][0].endswith("Guard dispatched")
    time.sleep(1.1)
    again = client.post(f"/api/guard/alerts/{eid}/ack", json={"note": "False alarm"}).json()
    assert again["acknowledgedAt"] == first["acknowledgedAt"]      # first time kept
    assert again["ackNote"] == "False alarm"
    keep = client.post(f"/api/guard/alerts/{eid}/ack").json()       # body optional
    assert keep["ackNote"] == "False alarm"
    assert len(sent) == 1                                           # only first ack notifies
    inc = client.get(f"/api/incidents/{eid}").json()
    assert inc["guardAcknowledgedAt"] == first["acknowledgedAt"]
    assert inc["guardAckNote"] == "False alarm"


def test_guard_ack_errors(client, sent):
    plain = add_event()
    g = add_event(guard_notified=True)
    assert client.post(f"/api/guard/alerts/{plain}/ack", json={}).status_code == 404
    assert client.post("/api/guard/alerts/999/ack", json={}).status_code == 404
    assert client.post(f"/api/guard/alerts/{g}/ack", json={"note": "x" * 201}).status_code == 400
    assert client.post(f"/api/guard/alerts/{g}/ack", json={"note": "x" * 200}).status_code == 200
    assert sql("SELECT guard_ack_at FROM events WHERE id=?", (plain,))[0][0] is None


def test_security_away_from_home(client):
    now = time.time()
    p = client.put("/api/security", json={"away": {
        "enabled": True, "from": _iso_utc(now - 3600), "to": _iso_utc(now + 86400)}}).json()
    assert p["level"] == "normal"                      # chosen level is unchanged
    assert p["effectiveLevel"] == "high" and p["highReason"] == "away"
    assert p["away"]["enabled"] is True and p["away"]["from"].endswith("Z")
    assert client.get("/api/status").json()["securityLevel"] == "high"
    # turning it off keeps the dates for next time
    off = client.put("/api/security", json={"away": {"enabled": False}}).json()
    assert off["effectiveLevel"] == "normal" and off["highReason"] is None
    assert off["away"]["from"] == p["away"]["from"]
    # null clears a bound (open-ended)
    cleared = client.put("/api/security", json={"away": {"to": None}}).json()
    assert cleared["away"]["to"] is None and cleared["away"]["from"] == p["away"]["from"]


@pytest.mark.parametrize("away", [
    {"from": "2026-10-28T12:00", "to": "2026-10-24T18:00"},     # ends before it starts
    {"from": "2026-10-24T18:00", "to": "2026-10-24T18:00"},     # empty range
    {"from": "next friday"},                                     # not a date
])
def test_security_away_400(client, away):
    assert client.put("/api/security", json={"away": away}).status_code == 400


def _iso_utc(epoch):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def test_incident_items(client):
    import vault_utils
    eid = add_event(items=["knife"], guard_notified=True)
    assert client.get(f"/api/incidents/{eid}").json()["items"] == ["knife"]
    vault_utils.set_event_items(eid, ["knife", "scissors"])
    assert client.get(f"/api/incidents/{eid}").json()["items"] == ["knife", "scissors"]
    assert client.get("/api/guard/alerts").json()[0]["items"] == ["knife", "scissors"]
    plain = add_event()
    assert client.get(f"/api/incidents/{plain}").json()["items"] == []


def test_family_tracker_api(client, engine):
    import vault_utils
    jpg = __import__("conftest").jpeg()
    for name, role in (("Azhad", "family"), ("Chong", "family"), ("Ali", "guest")):
        r = client.post("/api/people", data={"name": name, "role": role},
                        files=[("photos", ("a.jpg", jpg, "image/jpeg"))])
        assert r.status_code == 201, r.text
    fam = client.get("/api/family").json()
    assert [p["name"] for p in fam] == ["Azhad", "Chong"]                  # residents only
    assert all(p["status"] == "unknown" and p["since"] is None for p in fam)

    vault_utils.log_movement("Azhad", "left", "camera", ts=time.time() - 60)
    vault_utils.log_movement(None, "left", "camera")                        # someone, face not seen
    fam = {p["name"]: p for p in client.get("/api/family").json()}
    assert fam["Azhad"]["status"] == "out" and fam["Azhad"]["source"] == "camera"

    engine.last_seen["Azhad"] = time.time()                                 # seen inside again
    assert {p["name"]: p for p in client.get("/api/family").json()}["Azhad"]["status"] == "home"

    chong = fam["Chong"]["id"]
    r = client.put(f"/api/family/{chong}/status", json={"status": "out"})
    assert r.status_code == 200 and r.json()["status"] == "out" and r.json()["source"] == "manual"
    assert client.put(f"/api/family/{chong}/status", json={"status": "away"}).status_code == 422
    ali = next(p["id"] for p in client.get("/api/people").json() if p["name"] == "Ali")
    assert client.put(f"/api/family/{ali}/status", json={"status": "home"}).status_code == 400
    assert client.put("/api/family/999/status", json={"status": "home"}).status_code == 404

    moves = client.get("/api/family/movements?limit=5").json()
    assert moves[0]["name"] == "Chong" and moves[0]["direction"] == "left" and moves[0]["source"] == "manual"
    assert any(m["name"] is None for m in moves)


def test_chat_who_is_home(client, engine):
    import chat
    import vault_utils
    jpg = __import__("conftest").jpeg()
    client.post("/api/people", data={"name": "Azhad"}, files=[("photos", ("a.jpg", jpg, "image/jpeg"))])
    vault_utils.log_movement("Azhad", "arrived", "camera")
    res, err = chat.ChatTools(engine).run("who_is_home", {})
    assert not err and res[0]["name"] == "Azhad" and res[0]["status"] == "home"


def test_security_off_with_timer(client):
    from datetime import datetime, timezone
    client.put("/api/security", json={"level": "high"})
    until = datetime.fromtimestamp(time.time() + 3 * 3600, timezone.utc).isoformat().replace("+00:00", "Z")
    s = client.put("/api/security", json={"level": "off", "offUntil": until}).json()
    assert s["level"] == "off" and s["effectiveLevel"] == "off" and s["resumeLevel"] == "high"
    assert s["offUntil"][:16] == until[:16]
    assert client.get("/api/status").json()["securityLevel"] == "off"
    # until turned back on
    s = client.put("/api/security", json={"level": "off", "offUntil": None}).json()
    assert s["offUntil"] is None and s["resumeLevel"] == "high"
    # turning it back on clears the timer
    s = client.put("/api/security", json={"level": "normal"}).json()
    assert s["level"] == "normal" and s["offUntil"] is None
    past = datetime.fromtimestamp(time.time() - 60, timezone.utc).isoformat().replace("+00:00", "Z")
    assert client.put("/api/security", json={"level": "off", "offUntil": past}).status_code == 400
    assert client.put("/api/security", json={"offUntil": until}).status_code == 400   # not Off


def test_awaiting_guard_count(client):
    now = time.time()
    add_event(ts=now - 60, guard_notified=True)                # waiting for the guard house
    acked = add_event(ts=now - 30, guard_notified=True)
    add_event(ts=now - 3 * 86400, guard_notified=True)        # too old to still be waiting
    add_event("Ali", "guest_outside_window", ts=now)          # homeowner only
    client.post(f"/api/guard/alerts/{acked}/ack", json={"note": "Guard dispatched"})
    assert client.get("/api/dashboard/summary").json()["awaitingGuard"] == 1


def test_websocket_pushes_guard_ack(client):
    eid = add_event(ts=time.time(), guard_notified=True)
    with client.websocket_connect("/api/ws/events") as ws:
        assert ws.receive_json()["type"] == "camera_status"
        client.post(f"/api/guard/alerts/{eid}/ack", json={"note": "Guard dispatched"})
        msg = ws.receive_json()
        assert msg["type"] == "guard_ack" and msg["data"]["id"] == str(eid)
        assert msg["data"]["guardAckNote"] == "Guard dispatched" and msg["data"]["guardAcknowledgedAt"]
        client.post(f"/api/guard/alerts/{eid}/ack", json={"note": "Checking CCTV"})   # note changed
        assert ws.receive_json()["data"]["guardAckNote"] == "Checking CCTV"
