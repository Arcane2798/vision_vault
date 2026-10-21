"""rules.match_lost_unknown: a new ByteTrack id carries on a lost unknown person's timer."""
from rules import match_lost_unknown, box_center_distance

BOX = (100, 100, 150, 300)          # 200 px tall person


def lost(box=BOX, seen=9.0, identity="unknown", since=5.0):
    return {"box": box, "seen": seen, "identity": identity, "unknown_since": since}


def test_center_distance():
    assert box_center_distance((0, 0, 10, 10), (30, 40, 40, 50)) == 50


def test_nearby_recent_unknown_is_matched():
    assert match_lost_unknown((110, 105, 160, 305), {3: lost()}, now=10.0) == 3


def test_too_old_is_not_matched():
    assert match_lost_unknown(BOX, {3: lost(seen=6.0)}, now=10.0) is None


def test_still_in_frame_is_not_matched():
    assert match_lost_unknown(BOX, {3: lost(seen=10.0)}, now=10.0) is None


def test_too_far_is_not_matched():
    assert match_lost_unknown((500, 100, 550, 300), {3: lost()}, now=10.0) is None


def test_resident_is_never_a_candidate():
    assert match_lost_unknown(BOX, {3: lost(identity="Azhad")}, now=10.0) is None


def test_unknown_without_timer_is_not_a_candidate():
    assert match_lost_unknown(BOX, {3: lost(since=None)}, now=10.0) is None


def test_closest_candidate_wins():
    cands = {3: lost(box=(160, 100, 210, 300)), 4: lost(box=(105, 100, 155, 300))}
    assert match_lost_unknown(BOX, cands, now=10.0) == 4


def test_resident_nearer_than_unknown_is_skipped():
    cands = {3: lost(box=BOX, identity="Azhad"), 4: lost(box=(180, 100, 230, 300))}
    assert match_lost_unknown(BOX, cands, now=10.0) == 4


def test_custom_limits():
    assert match_lost_unknown(BOX, {3: lost(seen=5.0)}, now=10.0, max_gap=6.0) == 3
    assert match_lost_unknown((300, 100, 350, 300), {3: lost()}, now=10.0, max_dist=0.5) is None
