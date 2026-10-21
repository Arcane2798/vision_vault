import json

import pytest

import house

CFG = {
    "rooms": [
        {"id": "front", "name": "Front yard", "x": 0, "y": 0, "w": 2, "h": 4, "exit": True},
        {"id": "living", "name": "Living room", "x": 2, "y": 0, "w": 4, "h": 4},
        {"id": "hall", "name": "Hallway", "x": 6, "y": 0, "w": 2, "h": 4},
        {"id": "bed", "name": "Bedroom", "x": 8, "y": 0, "w": 3, "h": 2},
        {"id": "kitchen", "name": "Kitchen", "x": 8, "y": 2, "w": 3, "h": 2},
        {"id": "back", "name": "Back yard", "x": 11, "y": 0, "w": 2, "h": 4, "exit": True},
    ],
    "doors": [["front", "living"], ["living", "hall"], ["hall", "bed"], ["hall", "kitchen"],
              ["kitchen", "back"]],
    "cameras": [
        {"id": "cam-01", "name": "Front door", "room": "living", "live": True},
        {"id": "k", "name": "Kitchen", "room": "kitchen", "video": "k.mp4", "offset": 0},
        {"id": "h", "name": "Hall", "room": "hall", "video": "h.mp4", "offset": 2},
    ],
}
EXITS = ["front", "back"]


def test_safe_path_avoids_intruder():
    assert house.safe_path(CFG["doors"], "bed", EXITS, set()) == ["bed", "hall", "kitchen", "back"]
    assert house.safe_path(CFG["doors"], "living", EXITS, set()) == ["living", "front"]
    # intruder in the living room: the bedroom goes out the back
    assert house.safe_path(CFG["doors"], "bed", EXITS, {"living"}) == ["bed", "hall", "kitchen", "back"]
    # intruder in the hallway: the bedroom is cut off
    assert house.safe_path(CFG["doors"], "bed", EXITS, {"hall"}) is None
    # you may leave the room the intruder is in
    assert house.safe_path(CFG["doors"], "kitchen", EXITS, {"kitchen"}) == ["kitchen", "back"]
    assert house.safe_path(CFG["doors"], "front", EXITS, set()) == ["front"]


def test_plan_safe_paths():
    occ = {"living": [{"name": "unknown", "kind": "unknown", "camera": "cam-01"}],
           "bed": [{"name": "Azhad", "kind": "family", "camera": "x"}],
           "kitchen": [{"name": "Ali", "kind": "guest", "camera": "k"}]}
    plans = house.plan_safe_paths(CFG, occ)
    assert [p["name"] for p in plans] == ["Azhad"]              # residents only
    assert plans[0]["path"] == ["bed", "hall", "kitchen", "back"]
    assert plans[0]["advice"] == "Leave via Hallway \u2192 Kitchen \u2192 Back yard."
    occ["hall"] = [{"name": "unknown", "kind": "unknown", "camera": "h"}]
    stuck = house.plan_safe_paths(CFG, occ)[0]
    assert stuck["path"] is None and "lock the door" in stuck["advice"]
    assert house.plan_safe_paths(CFG, {"bed": [{"name": "Azhad", "kind": "family", "camera": "x"}]}) == []


def test_occupancy_and_live():
    tl = {"cameras": {"k": [{"t": 0.0, "people": []},
                            {"t": 1.0, "people": [{"name": "Azhad", "kind": "family"}]},
                            {"t": 4.0, "people": []}],
                      "h": [{"t": 2.0, "people": [{"name": "unknown", "kind": "unknown"}]}]}}
    assert house.occupancy_at(CFG, tl, 0.5) == {}
    occ = house.occupancy_at(CFG, tl, 2.2)
    assert occ == {"kitchen": [{"name": "Azhad", "kind": "family", "camera": "k"}],
                   "hall": [{"name": "unknown", "kind": "unknown", "camera": "h"}]}
    assert house.occupancy_at(CFG, tl, 3.9) == {}                      # samples too old
    assert house.timeline_duration(tl) == 4.0
    live = house.merge_live(CFG, {}, [{"name": "unknown", "kind": "unknown"},
                                      {"name": "Ali", "kind": "guest_allowed"},
                                      {"name": "unknown", "kind": "leaving"}])
    assert live == {"living": [{"name": "unknown", "kind": "unknown", "camera": "cam-01"},
                               {"name": "Ali", "kind": "guest", "camera": "cam-01"}]}


@pytest.mark.parametrize("bad, msg", [
    ({"rooms": []}, "rooms"),
    ({"rooms": [{"id": "a", "name": "A", "x": 0, "y": 0, "w": 1, "h": 1}]}, "exit"),
    ({"rooms": CFG["rooms"], "doors": [["front", "attic"]]}, "door"),
    ({"rooms": CFG["rooms"], "cameras": [{"id": "c", "room": "attic", "live": True}]}, "unknown room"),
    ({"rooms": CFG["rooms"], "cameras": [{"id": "c", "room": "hall"}]}, "video"),
])
def test_validate_map(bad, msg):
    with pytest.raises(house.MapError, match=msg):
        house.validate_map(bad)
    house.validate_map(CFG)


def test_sample_map_file_is_valid():
    house.load_map("house_map.json")


def test_map_api(client, engine, tmp_path, monkeypatch):
    monkeypatch.setattr(house, "MAP_FILE", tmp_path / "m.json")
    monkeypatch.setattr(house, "TIMELINE_FILE", tmp_path / "t.json")
    monkeypatch.setattr(house, "VIDEO_DIR", tmp_path / "videos")
    assert client.get("/api/map").status_code == 400                    # no map yet
    (tmp_path / "m.json").write_text(json.dumps(CFG))
    m = client.get("/api/map").json()
    assert [r["id"] for r in m["rooms"]][0] == "front" and m["timeline"]["ready"] is False
    assert {c["id"]: c["videoFound"] for c in m["cameras"]} == {"cam-01": True, "k": False, "h": False}
    r = client.post("/api/map/process")
    assert r.status_code == 400 and "k.mp4" in r.json()["detail"]
    (tmp_path / "t.json").write_text(json.dumps({"processedAt": 1.0, "cameras": {
        "h": [{"t": 2.0, "people": [{"name": "unknown", "kind": "unknown"}]}]}}))
    assert client.get("/api/map").json()["timeline"]["duration"] == 2.0
    engine.in_view = [{"name": "Azhad", "kind": "family"}]
    s = client.get("/api/map/state?t=2.5&live=true").json()
    assert s["intruderRooms"] == ["hall"]
    assert s["rooms"]["living"][0]["name"] == "Azhad"
    assert s["safePaths"] == [{"name": "Azhad", "from": "living", "path": ["living", "front"],
                               "advice": "Leave via Front yard."}]
    assert client.get("/api/map/state").json()["rooms"] == {}
    assert client.get("/api/map/status").json()["state"] == "idle"
