"""The real VisionEngine's security state (On / Off, Off timer, persistence) without models."""
import threading
import time

import pytest

import vault_utils
from rules import DEFAULT_LEVEL, security_params

engine_mod = pytest.importorskip("engine")


def bare_engine():
    e = engine_mod.VisionEngine.__new__(engine_mod.VisionEngine)   # skip __init__ (models, camera)
    e.lock = threading.Lock()
    e.security = {"level": DEFAULT_LEVEL, "off_until": None, "updated_at": None}
    e.level, e.params, e._next_level_check = DEFAULT_LEVEL, security_params(DEFAULT_LEVEL), 0
    return e


def test_off_timer_returns_to_on(sent):
    e = bare_engine()
    assert e.get_security()["effective_level"] == "on" and e.params["alerts"] is True
    s = e.set_security(level="off", off_until=time.time() + 3600)
    assert s["effective_level"] == "off" and s["off_until"] is not None
    assert e.params["alerts"] is False and e.params["guard_alert"] is False

    reloaded = bare_engine()                     # settings survive a restart
    reloaded._load_security()
    assert reloaded.get_security()["level"] == "off"
    assert reloaded.get_security()["off_until"] == pytest.approx(s["off_until"])

    with pytest.raises(ValueError):
        e.set_security(off_until=time.time() - 5)            # timer in the past
    with pytest.raises(ValueError):
        bare_engine().set_security(off_until=time.time() + 60)   # not Off
    with pytest.raises(ValueError):
        e.set_security(level="party")

    vault_utils.set_settings({"off_until": repr(time.time() - 1)})   # the timer runs out
    e._load_security()
    s = e.get_security()
    assert s["level"] == "on" and s["effective_level"] == "on" and s["off_until"] is None
    assert vault_utils.get_settings()["security_level"][0] == "on"   # persisted


def test_expired_timer_reads_on_without_the_loop(sent):
    e = bare_engine()
    e.set_security(level="off", off_until=time.time() + 3600)
    with e.lock:
        e.security["off_until"] = time.time() - 1      # passed since the last loop check
    s = e.get_security()
    assert s["level"] == "on" and s["effective_level"] == "on"


def test_on_clears_the_off_timer_and_old_levels_mean_on(sent):
    e = bare_engine()
    e.set_security(level="off", off_until=time.time() + 3600)
    s = e.set_security(level="on")
    assert s["level"] == "on" and s["off_until"] is None
    assert vault_utils.get_settings()["off_until"][0] == ""
    e.set_security(level="off")
    assert e.get_security()["off_until"] is None          # off until turned back on
    assert e.set_security(level="high")["effective_level"] == "on"
    assert e.set_security(level="normal")["level"] == "on"


def test_old_saved_levels_load_as_on(sent):
    vault_utils.set_settings({"security_level": "high", "away_enabled": "1",
                              "away_from": "", "away_to": "", "resume_level": "high"})
    e = bare_engine()
    e._load_security()
    s = e.get_security()
    assert s["level"] == "on" and s["effective_level"] == "on"
    assert set(s) == {"level", "off_until", "updated_at", "effective_level"}
    assert vault_utils.get_settings()["away_enabled"][0] == "1"   # old rows left untouched
