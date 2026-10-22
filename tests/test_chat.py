"""Chat tools and loop without a real LLM (fake `generate`; Gemini is never called)."""
import pytest

import chat
from conftest import add_event, jpeg, sql


@pytest.fixture(autouse=True)
def no_gemini(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("real Gemini call attempted")
    monkeypatch.setattr(chat, "make_client", boom)
    monkeypatch.setattr(chat, "_generate", boom)


def person(client, name, role="family"):
    return client.post("/api/people", data={"name": name, "role": role},
                       files=[("photos", ("p.jpg", jpeg(), "image/jpeg"))]).json()


def test_read_tools(client, engine):
    add_event()
    eid = add_event("Ali", "guest_outside_window")
    t = chat.ChatTools(engine)
    s = t.get_summary()
    assert s["totalIncidents"] == 2 and s["unresolvedAlerts"] == 2 and s["cameraOnline"]
    li = t.list_incidents(limit=1)
    assert li["matching"] == 2 and li["shown"] == 1
    assert t.list_incidents(status="confirmed")["matching"] == 0
    assert t.get_incident(eid)["identity"] == "Ali"
    res, err = t.run("get_incident", {"id": 999})
    assert err and "not found" in res["error"]
    res, err = t.run("list_incidents", {"status": "bogus"})
    assert err
    res, err = t.run("nope", {})
    assert err
    engine.in_view = [{"name": "Azhad", "kind": "family"}]
    assert t.get_live_status()["peopleInView"] == engine.in_view


def test_where_is(client, engine):
    person(client, "Azhad")
    t = chat.ChatTools(engine)
    assert "not registered" in t.where_is("Ghost")["answer"]
    assert "has not been seen" in t.where_is("azhad")["answer"]
    engine.last_seen = {"Azhad": 1_800_000_000}
    assert "last seen at the front door at 2027-01-15 16:00" in t.where_is("Azhad")["answer"]
    engine.in_view = [{"name": "Azhad", "kind": "family"}]
    assert "right now" in t.where_is("Azhad")["answer"]


def test_write_tools_change_nothing(client, engine):
    eid = add_event()
    p = person(client, "Ali")
    before_events = sql("SELECT * FROM events")
    before_people = sql("SELECT * FROM people")
    before_sec = dict(engine.sec)
    t = chat.ChatTools(engine)

    assert not hasattr(t, "review_incident") and "review_incident" not in chat.TOOL_NAMES
    a = t.set_security_level("off", "2099-10-24T23:30")
    assert a["body"] == {"level": "off", "offUntil": "2099-10-24T15:30:00Z"}
    assert "back on" in a["summary"] and "Normal" not in a["summary"]
    assert t.set_security_level("off")["body"] == {"level": "off", "offUntil": None}
    assert t.run("set_security_level", {"level": "off", "until": "2001-01-01T00:00"})[1]   # past
    assert t.run("set_security_level", {"level": "on", "until": "2099-01-01"})[1]         # only for off
    a = t.set_security_level("on")
    assert a["method"] == "PUT" and a["path"] == "/api/security" and a["body"] == {"level": "on"}
    a = t.add_or_update_guest("ali", "2026-10-24T14:00", "2026-10-24T18:00")
    assert a["method"] == "PATCH" and a["path"] == f"/api/people/{p['id']}"
    assert a["body"] == {"role": "guest", "validFrom": "2026-10-24T06:00:00Z",
                         "validTo": "2026-10-24T10:00:00Z"}
    a = t.add_or_update_guest("Siti", "2026-10-24")
    assert a["kind"] == "add_person"
    assert a["prefill"] == {"name": "Siti", "role": "guest",
                            "validFrom": "2026-10-23T16:00:00Z", "validTo": None}
    assert t.pending is a

    res, err = t.run("set_security_level", {"level": "on"})
    assert not err and "Confirm" in res["note"]
    assert t.run("set_security_level", {"level": "party"})[1]
    for old in ("normal", "high", "away"):                       # removed levels
        assert t.run("set_security_level", {"level": old})[1]
    assert t.run("add_or_update_guest", {"name": "x/y"})[1]
    assert t.run("add_or_update_guest", {"name": "Q", "valid_from": "2026-10-25",
                                         "valid_to": "2026-10-24T00:00"})[1]

    assert sql("SELECT * FROM events") == before_events
    assert sql("SELECT * FROM people") == before_people
    assert engine.sec == before_sec


def test_run_chat_with_fake_model(client, engine):
    turns = iter([
        {"text": "", "calls": [{"id": "1", "name": "set_security_level",
                                "args": {"level": "off"}}],
         "raw": None, "blocked": False, "truncated": False},
        {"text": "Press Confirm.", "calls": [], "raw": None, "blocked": False,
         "truncated": False},
    ])
    out = chat.run_chat([{"role": "user", "content": "Turn security off"}], engine,
                        generate=lambda h, s: next(turns), now=0)
    assert out["reply"] == "Press Confirm."
    assert out["pendingAction"]["body"] == {"level": "off", "offUntil": None}
    assert engine.sec["level"] == "on"
    with pytest.raises(ValueError):
        chat.run_chat([{"role": "assistant", "content": "hi"}], engine,
                      generate=lambda h, s: None)


def test_clean_history():
    msgs = [{"role": "assistant", "content": "hello"}, {"role": "user", "content": " "}]
    msgs += [{"role": "user", "content": str(i)} for i in range(25)]
    h = chat.clean_history(msgs)
    assert len(h) == 20 and h[0] == {"role": "user", "text": "5"}


def test_chat_route_without_key_is_503(client, monkeypatch):
    def not_configured():
        raise chat.ChatNotConfigured(chat.NOT_CONFIGURED)
    monkeypatch.setattr(chat, "make_client", not_configured)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503 and r.json()["detail"] == chat.NOT_CONFIGURED
    bad = client.post("/api/chat", json={"messages": [{"role": "system", "content": "x"}]})
    assert bad.status_code == 422


def test_chat_route_with_fake_client(client, monkeypatch):
    monkeypatch.setattr(chat, "make_client", lambda: object())
    monkeypatch.setattr(chat, "_generate", lambda c, m, h, s: {
        "text": "All quiet.", "calls": [], "raw": None, "blocked": False, "truncated": False})
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200 and r.json() == {"reply": "All quiet.", "pendingAction": None}
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "  "}]})
    assert r.status_code == 400


def test_away_from_home_tool_removed():
    assert "set_away_from_home" not in chat.TOOL_NAMES
    assert chat.WRITE_TOOLS == {"add_or_update_guest", "set_security_level"}
    text = chat.SYSTEM + " ".join(t["description"] for t in chat.TOOLS)
    for word in ("High", "Normal", "away from home", "vacation"):
        assert word not in text


def test_live_status_reports_level_and_off_timer(client, engine):
    t = chat.ChatTools(engine)
    s = t.get_live_status()
    assert s["securityLevel"] == "on" and s["offUntil"] is None
    for gone in ("highBecause", "awayFromHome", "chosenLevel", "sleepTime"):
        assert gone not in s
    engine.sec.update(level="off", off_until=None)
    assert t.get_live_status()["offUntil"] == "until turned back on"
    engine.sec.update(off_until=4102444800.0)                      # 2100-01-01 00:00 UTC
    s = t.get_live_status()
    assert s["securityLevel"] == "off" and s["offUntil"].startswith("2100-01-01 08:00")
