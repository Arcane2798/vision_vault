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


# ---------- track housekeeping ----------
def stale_tracks(last_seen: dict, now: float, max_age: float) -> set:
    """Track ids not seen for more than `max_age` seconds (their state can be dropped)."""
    return {tid for tid, t in last_seen.items() if now - t > max_age}


# ---------- security level (feature 5.1) ----------
SECURITY_LEVELS = ("normal", "high")
DEFAULT_LEVEL = "normal"
# levels saved before Wed 21 Oct; "home" (no guard alert) was dropped so a home invasion
# with residents inside still reaches the guard house
LEGACY_LEVELS = {"home": "normal", "away": "high"}
DEFAULT_NIGHT_START, DEFAULT_NIGHT_END = "23:00", "06:00"

_NORMAL = {"grace": 3.0,          # seconds an unknown must be seen before alerting
           "match_thresh": 0.40,   # min cosine similarity for a face match
           "guard_alert": True}    # also alert the guard house (on at every level)

_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def security_params(level: str) -> dict:
    """Rule thresholds for a security level. Raises ValueError on an unknown level."""
    if level not in SECURITY_LEVELS:
        raise ValueError(f"unknown security level {level!r}")
    params = dict(_NORMAL)
    if level == "high":
        params.update(grace=1.0, match_thresh=_NORMAL["match_thresh"] + 0.05)
    return params


def normalize_level(value):
    """A stored level mapped onto the current levels (old "home"/"away" -> "normal"/"high")."""
    return LEGACY_LEVELS.get(value, value)


def guard_alert_due(event_type: str, guard_alert: bool) -> bool:
    """True if the guard house is alerted (Guard House view, `guard_notified`): intrusions only,
    when `security_params(level)["guard_alert"]` is on (it is at every level).
    Visitors outside their window go to the homeowner only."""
    return event_type == "intrusion" and bool(guard_alert)


def should_alert_guard(event_type: str, guard_alert: bool, guard_chat_id) -> bool:
    """True if the guard house also gets a Telegram copy: a due guard alert and a guard chat set."""
    return guard_alert_due(event_type, guard_alert) and bool(guard_chat_id)


MAX_ACK_NOTE = 200


def guard_ack_message(hhmm: str, note=None) -> str:
    """Homeowner Telegram text when the guard house acknowledges an alert."""
    text = f"\U0001F6E1 Guard house acknowledged the alert at {hhmm}"
    return f"{text} \u2014 {note}" if note else text


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


def in_away_window(away_from, away_to, now: float) -> bool:
    """True if epoch `now` is in [away_from, away_to). A None bound is open-ended."""
    return (away_from is None or now >= away_from) and (away_to is None or now < away_to)


def valid_away_window(away_from, away_to) -> bool:
    """An away-from-home range must start before it ends (open-ended bounds are fine)."""
    return away_from is None or away_to is None or away_from < away_to


def high_reason(night_enabled: bool, night_start: str, night_end: str, now,
                away_enabled: bool = False, away_from=None, away_to=None):
    """Why a schedule forces High right now: "away" (away-from-home dates, e.g. a vacation),
    "sleep" (the daily sleep time) or None.

    `now` is a datetime (local time) or epoch seconds (converted with the machine's local time).
    """
    if hasattr(now, "hour"):
        local, epoch = now, now.timestamp()
    else:
        local, epoch = datetime.fromtimestamp(now), now
    if away_enabled and in_away_window(away_from, away_to, epoch):
        return "away"
    if night_enabled and in_night_window(night_start, night_end,
                                         local.hour * 60 + local.minute):
        return "sleep"
    return None


def effective_level(level: str, night_enabled: bool, night_start: str,
                    night_end: str, now, away_enabled: bool = False,
                    away_from=None, away_to=None) -> str:
    """The level the engine should use: 'high' while the sleep time or the away-from-home
    dates apply, else `level`."""
    if high_reason(night_enabled, night_start, night_end, now,
                   away_enabled, away_from, away_to):
        return "high"
    return level
