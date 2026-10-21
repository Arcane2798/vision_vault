from datetime import datetime

import pytest

import rules
from rules import (classify_person, effective_level, guard_ack_message, guard_alert_due,
                   in_night_window, security_params, should_alert_guard, valid_hhmm,
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
    n, h = security_params("normal"), security_params("high")
    assert n == {"grace": 3.0, "match_thresh": 0.40, "guard_alert": True}
    assert h["grace"] == 1.0 and h["guard_alert"] is True       # guard alerted at every level
    assert h["match_thresh"] == pytest.approx(0.45)
    for old in ("home", "away", "party"):                      # removed levels are rejected
        with pytest.raises(ValueError):
            security_params(old)
    security_params("high")["grace"] = 99      # must return a copy
    assert security_params("normal")["grace"] == 3.0


@pytest.mark.parametrize("v,ok", [("00:00", True), ("23:59", True), ("06:30", True),
                                  ("24:00", False), ("6:30", False), ("12:60", False),
                                  ("12:5", False), ("", False), (None, False), (630, False),
                                  ("12:30 ", False), ("ab:cd", False)])
def test_valid_hhmm(v, ok):
    assert valid_hhmm(v) is ok


def test_night_window_same_day():
    assert in_night_window("09:00", "17:00", 9 * 60)
    assert in_night_window("09:00", "17:00", 17 * 60 - 1)
    assert not in_night_window("09:00", "17:00", 17 * 60)
    assert not in_night_window("09:00", "17:00", 9 * 60 - 1)


def test_night_window_crosses_midnight():
    for m in (23 * 60, 23 * 60 + 59, 0, 3 * 60, 6 * 60 - 1):
        assert in_night_window("23:00", "06:00", m)
    for m in (6 * 60, 12 * 60, 23 * 60 - 1):
        assert not in_night_window("23:00", "06:00", m)


def test_night_window_empty_when_equal():
    assert not any(in_night_window("10:00", "10:00", m) for m in range(0, 1440, 7))


def test_effective_level():
    night = datetime(2026, 10, 20, 2, 0)
    day = datetime(2026, 10, 20, 14, 0)
    assert effective_level("normal", True, "23:00", "06:00", night) == "high"
    assert effective_level("normal", True, "23:00", "06:00", day) == "normal"
    assert effective_level("normal", False, "23:00", "06:00", night) == "normal"
    assert effective_level("high", True, "23:00", "06:00", day) == "high"
    assert effective_level("normal", True, "23:00", "06:00", night.timestamp()) == "high"
    assert effective_level("normal", True, "23:00", "06:00", day.timestamp()) == "normal"


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


def test_high_reason_sleep_and_away():
    from rules import high_reason, in_away_window, valid_away_window
    night = datetime(2026, 10, 25, 2, 0)                  # 02:00, inside 23:00-06:00
    day = datetime(2026, 10, 25, 14, 0)
    trip_from, trip_to = datetime(2026, 10, 24, 18, 0).timestamp(), datetime(2026, 10, 28, 12, 0).timestamp()
    assert high_reason(True, "23:00", "06:00", night) == "sleep"
    assert high_reason(True, "23:00", "06:00", day) is None
    assert high_reason(False, "23:00", "06:00", day, True, trip_from, trip_to) == "away"
    assert high_reason(True, "23:00", "06:00", night, True, trip_from, trip_to) == "away"   # away wins
    assert high_reason(False, "23:00", "06:00", day, False, trip_from, trip_to) is None    # switched off
    assert high_reason(False, "23:00", "06:00", datetime(2026, 10, 29, 9, 0), True, trip_from, trip_to) is None
    assert in_away_window(trip_from, trip_to, trip_from) and not in_away_window(trip_from, trip_to, trip_to)
    assert in_away_window(None, None, 0) and in_away_window(trip_from, None, trip_to + 1e6)
    assert valid_away_window(1, 2) and valid_away_window(None, 2) and valid_away_window(1, None)
    assert not valid_away_window(2, 2) and not valid_away_window(3, 2)
    assert effective_level("normal", False, "23:00", "06:00", day, True, trip_from, trip_to) == "high"
