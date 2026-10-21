from datetime import datetime

import pytest

import rules
from rules import (classify_person, effective_level, guard_ack_message, guard_alert_due,
                   security_params, should_alert_guard,
                   valid_person_name, visitor_allowed)


def test_family_always_allowed():
    assert visitor_allowed("family", 100, 200, 9999)
    assert visitor_allowed("family", None, None, 0)


@pytest.mark.parametrize("now,ok", [(99.9, False), (100, True), (150, True),
                                    (200, True), (200.1, False)])
def test_guest_window_boundaries(now, ok):
    assert visitor_allowed("guest", 100, 200, now) is ok


def test_guest_open_ended_and_bad_role():
    assert visitor_allowed("guest", None, None, 5)
    assert visitor_allowed("guest", None, 10, 5) and not visitor_allowed("guest", None, 10, 11)
    assert visitor_allowed("guest", 10, None, 1e12) and not visitor_allowed("guest", 10, None, 9)
    assert not visitor_allowed("admin", None, None, 5)


def test_classify_person():
    assert classify_person("unknown", None, 0) == "unknown"
    assert classify_person("ali", None, 0) == "family"          # back-compat: no row
    assert classify_person("ali", {"role": "family"}, 0) == "family"
    g = {"role": "guest", "valid_from": 100, "valid_to": 200}
    assert classify_person("ali", g, 100) == "guest_allowed"
    assert classify_person("ali", g, 200) == "guest_allowed"
    assert classify_person("ali", g, 201) == "guest_outside_window"
    assert classify_person("ali", g, 99) == "guest_outside_window"


@pytest.mark.parametrize("name", ["Azhad", "Ali bin Abu", "a-b_c", "x" * 40, "7"])
def test_valid_names(name):
    assert valid_person_name(name)


@pytest.mark.parametrize("name", ["", " Ali", "Ali ", "x" * 41, "unknown", "UNKNOWN", "../x",
                                  "a/b", "a.b", "CON", "nul", "com1", "LPT9", "Ali\n",
                                  "é"])
def test_invalid_names(name):
    assert not valid_person_name(name)


def test_security_params():
    n, h, o = security_params("normal"), security_params("high"), security_params("off")
    assert n == {"alerts": True, "grace": 5.0, "match_thresh": 0.40, "person_conf": 0.25,
                 "min_track_frames": 5, "departure_filter": True, "guard_alert": True}
    # High: same 5 s grace as Normal, more sensitive on every other knob
    assert h["grace"] == n["grace"] == 5.0
    assert h["person_conf"] == n["person_conf"] and h["min_track_frames"] < n["min_track_frames"]
    assert h["match_thresh"] == pytest.approx(0.45) and h["match_thresh"] > n["match_thresh"]
    assert h["departure_filter"] is False and h["alerts"] and h["guard_alert"]
    # Off: still tracks, never alerts
    assert o["alerts"] is False and o["guard_alert"] is False
    for old in ("home", "away", "party"):                      # removed levels are rejected
        with pytest.raises(ValueError):
            security_params(old)
    security_params("high")["grace"] = 99      # must return a copy
    assert security_params("normal")["grace"] == 5.0


def test_effective_level():
    day = datetime(2026, 10, 20, 14, 0)
    trip = (True, day.timestamp() - 60, day.timestamp() + 60)
    assert effective_level("normal", day) == "normal"
    assert effective_level("high", day) == "high"
    assert effective_level("normal", day, *trip) == "high"
    assert effective_level("normal", day.timestamp(), *trip) == "high"
    assert effective_level("normal", day.timestamp() + 120, *trip) == "normal"
    assert effective_level("normal", day, False, *trip[1:]) == "normal"


def test_guard_rules():
    assert guard_alert_due("intrusion", True)
    assert not guard_alert_due("intrusion", False)
    assert not guard_alert_due("guest_outside_window", True)
    assert should_alert_guard("intrusion", True, "-100123")
    assert not should_alert_guard("intrusion", True, None)
    assert not should_alert_guard("intrusion", True, "")
    assert not should_alert_guard("guest_outside_window", True, "-100123")
    assert not should_alert_guard("intrusion", False, "-100123")


def test_guard_ack_message():
    assert guard_ack_message("21:14") == "\U0001F6E1 Guard house acknowledged the alert at 21:14"
    assert guard_ack_message("21:14", "Guard dispatched").endswith(
        "21:14 — Guard dispatched")
    assert rules.MAX_ACK_NOTE == 200


def test_normalize_level_maps_old_saved_levels():
    from rules import normalize_level
    assert normalize_level("home") == "normal"
    assert normalize_level("away") == "high"
    assert normalize_level("normal") == "normal" and normalize_level("high") == "high"
    assert normalize_level(None) is None


def test_high_reason_away():
    import rules as r
    from rules import high_reason, in_away_window, valid_away_window
    assert not hasattr(r, "in_night_window") and not hasattr(r, "valid_hhmm")   # sleep time removed
    day = datetime(2026, 10, 25, 14, 0)
    trip_from, trip_to = datetime(2026, 10, 24, 18, 0).timestamp(), datetime(2026, 10, 28, 12, 0).timestamp()
    assert high_reason(day) is None
    assert high_reason(day, True, trip_from, trip_to) == "away"
    assert high_reason(day.timestamp(), True, trip_from, trip_to) == "away"
    assert high_reason(day, False, trip_from, trip_to) is None    # switched off
    assert high_reason(datetime(2026, 10, 29, 9, 0), True, trip_from, trip_to) is None
    assert in_away_window(trip_from, trip_to, trip_from) and not in_away_window(trip_from, trip_to, trip_to)
    assert in_away_window(None, None, 0) and in_away_window(trip_from, None, trip_to + 1e6)
    assert valid_away_window(1, 2) and valid_away_window(None, 2) and valid_away_window(1, None)
    assert not valid_away_window(2, 2) and not valid_away_window(3, 2)
    assert effective_level("normal", day, True, trip_from, trip_to) == "high"


def test_stale_tracks():
    from rules import stale_tracks
    seen = {1: 100.0, 2: 125.0, 3: 131.0}
    assert stale_tracks(seen, 131.0, 30.0) == {1}
    assert stale_tracks(seen, 200.0, 30.0) == {1, 2, 3}
    assert stale_tracks({}, 0, 30.0) == set()


def test_items_near():
    from rules import items_near, items_text
    person = (100, 100, 200, 400)                       # 100 wide, 300 tall
    knife_in_hand = ("knife", (190, 250, 230, 270))      # overlaps the right edge
    knife_at_arm = ("knife", (205, 250, 214, 260))       # outside the box, inside the 15% margin
    bat_far = ("baseball bat", (400, 100, 450, 300))
    assert items_near(person, [knife_in_hand, bat_far]) == ["knife"]
    assert items_near(person, [knife_at_arm]) == ["knife"]
    assert items_near(person, [knife_at_arm], margin=0) == []
    assert items_near(person, [knife_in_hand, ("scissors", (120, 120, 130, 130)), knife_at_arm]) == ["knife", "scissors"]
    assert items_near(person, []) == []
    assert items_text(["knife", "scissors"]) == "knife, scissors"


def test_family_tracker_rules():
    from rules import (ARRIVED, HOME, LEFT, OUT, UNKNOWN_PRESENCE, is_departing,
                       movement_direction, presence_status)
    assert movement_direction([0.2, 0.21, 0.2], [0.35, 0.4, 0.38]) == ARRIVED     # walked towards the camera
    assert movement_direction([0.6, 0.62, 0.6], [0.3, 0.32, 0.31]) == LEFT
    assert movement_direction([0.3, 0.3], [0.33, 0.32]) is None                 # stood still
    assert movement_direction([], [0.3]) is None
    assert movement_direction([0.2, 0.2, 0.9], [0.4, 0.4, 0.4]) == ARRIVED      # one noisy box ignored
    assert is_departing([0.6, 0.6], [0.45, 0.44]) is True                       # close, walking away
    assert is_departing([0.3, 0.3], [0.2, 0.2]) is False                        # started far: a real visitor/intruder
    assert is_departing([0.6, 0.6], [0.58, 0.6]) is False                       # close but not leaving
    assert presence_status(None, None, None) == UNKNOWN_PRESENCE
    assert presence_status(LEFT, 100.0, 90.0) == OUT
    assert presence_status(ARRIVED, 100.0, 90.0) == HOME
    assert presence_status(LEFT, 100.0, 150.0) == HOME                          # seen inside after leaving
    assert presence_status(None, None, 50.0) == HOME


def test_off_level_and_timer():
    from rules import off_active
    night = datetime(2026, 10, 25, 2, 0)          # inside the away dates below
    t = night.timestamp()
    away = (True, t - 3600, t + 86400)
    assert off_active("off", None, t) and off_active("off", t + 60, t)
    assert not off_active("off", t - 1, t) and not off_active("normal", None, t)
    # Off beats the away dates while it lasts ...
    assert effective_level("off", night, *away, off_until=t + 3600) == "off"
    assert effective_level("off", night, *away) == "off"           # until turned on
    # ... and afterwards the level it resumes to applies again, away dates included
    assert effective_level("off", night, off_until=t - 1, resume_level="normal") == "normal"
    assert effective_level("off", night, *away, off_until=t - 1) == "high"
