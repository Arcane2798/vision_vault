"""The real VisionEngine's security state (Off timer, resume level, persistence) without models."""
import threading
import time

import pytest

import vault_utils
from rules import DEFAULT_LEVEL, security_params

engine_mod = pytest.importorskip("engine")


def bare_engine():
    e = engine_mod.VisionEngine.__new__(engine_mod.VisionEngine)   # skip __init__ (models, camera)
    e.lock = threading.Lock()
    e.security = {"level": DEFAULT_LEVEL, "away_enabled": False, "away_from": None, "away_to": None,
                  "off_until": None, "resume_level": DEFAULT_LEVEL, "updated_at": None}
    e.level, e.params, e.high_reason, e._next_level_check = (
        DEFAULT_LEVEL, security_params(DEFAULT_LEVEL), None, 0)
    return e


def test_off_timer_resumes_previous_level(sent):
    e = bare_engine()
    e.set_security(level="high")
    s = e.set_security(level="off", off_until=time.time() + 3600)
    assert s["effective_level"] == "off" and s["resume_level"] == "high"
    assert e.params["alerts"] is False

    reloaded = bare_engine()                     # settings survive a restart
    reloaded._load_security()
    assert reloaded.get_security()["level"] == "off" and reloaded.get_security()["resume_level"] == "high"

    with pytest.raises(ValueError):
        e.set_security(off_until=time.time() - 5)            # timer in the past
    with pytest.raises(ValueError):
        bare_engine().set_security(off_until=time.time() + 60)   # not Off

    vault_utils.set_settings({"off_until": repr(time.time() - 1)})   # the timer runs out
    e._load_security()
    s = e.get_security()
    assert s["level"] == "high" and s["effective_level"] == "high" and s["off_until"] is None
    assert vault_utils.get_settings()["security_level"][0] == "high"   # persisted


def test_off_wins_over_away_dates(sent):
    e = bare_engine()
    e.set_security(away_enabled=True, away_from=time.time() - 60, away_to=time.time() + 3600)
    assert e.get_security()["effective_level"] == "high"
    assert e.get_security()["high_reason"] == "away"
    s = e.set_security(level="off")
    assert s["effective_level"] == "off" and s["high_reason"] is None
    assert e.set_security(level="normal")["effective_level"] == "high"   # away dates apply again
