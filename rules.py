"""Pure decision rules for Vision Vault.

No OpenCV / model / database imports here, so the tester agent can unit-test
these functions directly.
"""
import re
from datetime import datetime
from typing import Optional

FAMILY, GUEST = "family", "guest"
ROLES = (FAMILY, GUEST)

# What the engine decides about a tracked person once a face name is known
UNKNOWN = "unknown"
GUEST_ALLOWED = "guest_allowed"
GUEST_OUTSIDE = "guest_outside_window"   # also the event_type logged for it

_NAME_RE = re.compile(r"^[A-Za-z0-9 _-]{1,40}$")
_WINDOWS_RESERVED = ({"con", "prn", "aux", "nul"} | {f"com{i}" for i in range(1, 10)}
                     | {f"lpt{i}" for i in range(1, 10)})


def valid_person_name(name: str) -> bool:
    """Folder-safe name: letters, digits, space, '-', '_' (1-40 chars), not 'unknown'."""
    return (bool(_NAME_RE.match(name)) and name.strip() == name
            and name.lower() != UNKNOWN and name.lower() not in _WINDOWS_RESERVED)


def visitor_allowed(role: str, valid_from: Optional[float],
                    valid_to: Optional[float], now: float) -> bool:
    """True if a person with this role/window may be at the door at `now` (epoch seconds).

    Family is always allowed. A guest is allowed while valid_from <= now <= valid_to;
    a missing bound (None) is open-ended. Any other role is not allowed.
    """
    if role == FAMILY:
        return True
    if role != GUEST:
        return False
    if valid_from is not None and now < valid_from:
        return False
    if valid_to is not None and now > valid_to:
        return False
    return True


def classify_person(name: str, person: Optional[dict], now: float) -> str:
    """Decide how to treat a recognised face name.

    `person` is the people-table row ({role, valid_from, valid_to}) or None.
    Returns 'unknown', 'family', 'guest_allowed' or 'guest_outside_window'.
    A known face with no people row is treated as family (back-compat).
    """
    if name == UNKNOWN:
        return UNKNOWN
    if person is None or person.get("role") == FAMILY:
        return FAMILY
    if visitor_allowed(person.get("role"), person.get("valid_from"),
                       person.get("valid_to"), now):
        return GUEST_ALLOWED
    return GUEST_OUTSIDE


# ---------- security level (feature 5.1) ----------
SECURITY_LEVELS = ("home", "normal", "away")
DEFAULT_LEVEL = "normal"
DEFAULT_NIGHT_START, DEFAULT_NIGHT_END = "23:00", "06:00"

_NORMAL = {"grace": 3.0,          # seconds an unknown must be seen before alerting
           "move_required": 0.08,  # fraction of frame width an unknown must travel (0 = none)
           "match_thresh": 0.40,   # min cosine similarity for a face match
           "guard_alert": True}    # also alert the guard house (Phase 2)

_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def security_params(level: str) -> dict:
    """Rule thresholds for a security level. Raises ValueError on an unknown level."""
    if level not in SECURITY_LEVELS:
        raise ValueError(f"unknown security level {level!r}")
    params = dict(_NORMAL)
    if level == "home":
        params.update(grace=5.0, guard_alert=False)
    elif level == "away":
        params.update(grace=1.0, move_required=0.0,
                      match_thresh=_NORMAL["match_thresh"] + 0.05)
    return params


def should_alert_guard(event_type: str, guard_alert: bool, guard_chat_id) -> bool:
    """True if the guard house gets a copy of this alert: intrusions only, only when the
    security level allows it (`security_params(level)["guard_alert"]`) and a guard chat is set.
    Visitors outside their window go to the homeowner only."""
    return event_type == "intrusion" and bool(guard_alert) and bool(guard_chat_id)


def valid_hhmm(value) -> bool:
    """True for a 24-hour "HH:MM" string such as "23:00" or "06:30"."""
    return isinstance(value, str) and bool(_HHMM_RE.match(value))


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def in_night_window(start: str, end: str, minute_of_day: int) -> bool:
    """True if minute_of_day (0..1439) is in [start, end). The window may cross midnight;
    start == end means an empty window."""
    s, e = _minutes(start), _minutes(end)
    if s <= e:
        return s <= minute_of_day < e
    return minute_of_day >= s or minute_of_day < e


def effective_level(level: str, night_enabled: bool, night_start: str,
                    night_end: str, now) -> str:
    """The level the engine should use: 'away' inside an enabled night window, else `level`.

    `now` is a datetime (local time) or epoch seconds (converted with the machine's local time).
    """
    if not night_enabled:
        return level
    if not hasattr(now, "hour"):
        now = datetime.fromtimestamp(now)
    if in_night_window(night_start, night_end, now.hour * 60 + now.minute):
        return "away"
    return level
