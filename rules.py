"""Pure decision rules for Vision Vault.

No OpenCV / model / database imports here, so the tester agent can unit-test
these functions directly.
"""
import re
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


# ---------- family tracker (side feature 2) ----------
# The camera is inside the house, facing the front door (owner decision Wed 21 Oct):
# walking towards it (box grows) = arriving home, walking away (box shrinks) = leaving.
ARRIVED, LEFT = "arrived", "left"
HOME, OUT, UNKNOWN_PRESENCE = "home", "out", "unknown"


def _median(values):
    v = sorted(values)
    n = len(v)
    return 0.0 if n == 0 else (v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2)


def movement_direction(first_heights, last_heights, ratio: float = 1.3):
    """ARRIVED if the person's box grew by `ratio` (walked towards the camera), LEFT if it
    shrank by the same factor, else None. Heights are box height / frame height; the first and
    last few samples of a track are compared by median to ignore single noisy boxes."""
    a, b = _median(first_heights), _median(last_heights)
    if a <= 0 or b <= 0:
        return None
    if b / a >= ratio:
        return ARRIVED
    if a / b >= ratio:
        return LEFT
    return None


def presence_status(last_move, last_move_ts, last_seen_ts) -> str:
    """HOME / OUT / UNKNOWN_PRESENCE for one person. Being seen by the (inside) camera after the
    last recorded movement means home; otherwise the last movement decides."""
    if last_seen_ts is not None and (last_move_ts is None or last_seen_ts > last_move_ts):
        return HOME
    if last_move == ARRIVED:
        return HOME
    if last_move == LEFT:
        return OUT
    return UNKNOWN_PRESENCE


# ---------- track housekeeping ----------
def stale_tracks(last_seen: dict, now: float, max_age: float) -> set:
    """Track ids not seen for more than `max_age` seconds (their state can be dropped)."""
    return {tid for tid, t in last_seen.items() if now - t > max_age}


# ---------- security level (feature 5.1) ----------
# Owner decision Thu 22 Oct: just On / Off (Normal / High and the away-from-home dates removed).
SECURITY_LEVELS = ("on", "off")
DEFAULT_LEVEL = "on"
# levels saved or sent before Thu 22 Oct all mean "on"
LEGACY_LEVELS = {"normal": "on", "high": "on", "home": "on", "away": "on"}

_ON = {"alerts": True,          # raise intrusion / visitor alerts at all (off at level "off")
       "grace": 5.0,            # seconds an unknown must be seen before alerting
       "match_thresh": 0.25,    # min cosine similarity for a face match (0.40 until Thu 22 Oct, then 0.30;
                                # owner set 0.25 Fri 23 Oct: residents scored low on the webcam. Replay test:
                                # strangers were matched to a resident in 11% of 5 s windows at 0.25, 0% at 0.30)
       # weakest detection that confirms a track as a person. 0.25 = ByteTrack's own
       # new_track_thresh, the real floor (a lower value behaves the same). Tested Thu 22 Oct
       # on the four room videos: 0.55 / 0.20 / 0.10 all gave the same alerts and no false ones,
       # and lower caught living_room_2's stranger earlier. 0.55 since Fri 23 Oct (owner):
       # replay of all 10 test videos: every real person peaks >= 0.88, while duplicate boxes
       # (people overlapping, half hidden, at the edge) and a box drifting onto the floor never
       # pass 0.60; 0.55 drops all of them, keeps all 15 people, ~0.2 s later confirmation.
       "person_conf": 0.55,
       "min_track_frames": 3,    # frames a person must be tracked before the rules apply
       "guard_alert": True}     # also alert the guard house


def security_params(level: str) -> dict:
    """Rule thresholds for a security level. Raises ValueError on an unknown level."""
    if level not in SECURITY_LEVELS:
        raise ValueError(f"unknown security level {level!r}")
    params = dict(_ON)
    if level == "off":
        # e.g. a party: people are still tracked and shown, but nothing is recorded or alerted
        params.update(alerts=False, guard_alert=False)
    return params


def off_active(level: str, off_until, now: float) -> bool:
    """Level "off" holds until `off_until` (epoch; None = until the homeowner turns it back on)."""
    return level == "off" and (off_until is None or now < off_until)


def normalize_level(value):
    """A stored or sent level mapped onto the current levels (old normal/high/home/away -> "on")."""
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


def effective_level(level: str, now, off_until=None) -> str:
    """The level the engine should use: "off" while Off is active (`off_until` epoch, None =
    until turned back on), else "on". `now` is a datetime or epoch seconds."""
    epoch = now.timestamp() if hasattr(now, "hour") else now
    if off_active(normalize_level(level), off_until, epoch):
        return "off"
    return "on"


def box_center_distance(a, b) -> float:
    """Distance between the centres of two (x1, y1, x2, y2) boxes."""
    ax, ay = (a[0] + a[2]) / 2, (a[1] + a[3]) / 2
    bx, by = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def match_lost_unknown(box, lost: dict, now: float, max_gap: float = 3.0,
                       max_dist: float = 1.0) -> Optional[int]:
    """Old track id whose unknown-person timer a NEW track should carry on, or None.

    ByteTrack sometimes drops a person and gives them a new id; without this the 5 s grace
    would restart (and a second alert could fire for the same intruder). `lost` maps old
    track ids to {"box", "seen", "identity", "unknown_since"}. A candidate must be an
    unknown person with a running timer (never a recognised resident or visitor), not in
    the current frame, last seen at most `max_gap` s ago, with its box centre within
    `max_dist` box heights of the new box. The closest candidate wins.
    """
    best, best_d = None, None
    for tid, info in lost.items():
        if info.get("identity", UNKNOWN) != UNKNOWN or info.get("unknown_since") is None:
            continue
        gap = now - info["seen"]
        if gap <= 0 or gap > max_gap:
            continue
        old = info["box"]
        height = max(box[3] - box[1], old[3] - old[1], 1)
        d = box_center_distance(box, old)
        if d <= max_dist * height and (best_d is None or d < best_d):
            best, best_d = tid, d
    return best
