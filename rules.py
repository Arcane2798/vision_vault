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
