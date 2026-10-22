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
    # camera "h" has offset 2: its sample at 2.0 s of video is 4.0 s on the replay clock
    occ = house.occupancy_at(CFG, tl, 4.2)
    assert occ == {"hall": [{"name": "unknown", "kind": "unknown", "camera": "h"}]}
    occ = house.occupancy_at(CFG, tl, 2.2)
    assert occ == {"kitchen": [{"name": "Azhad", "kind": "family", "camera": "k"}]}
    assert house.occupancy_at(CFG, tl, 3.9) == {}                      # samples too old
    assert house.timeline_duration(tl) == 4.0
    assert house.timeline_duration(tl, CFG) == 4.0                     # h: 2 + 2.0
    live = house.merge_live(CFG, {}, [{"name": "unknown", "kind": "unknown"},
                                      {"name": "Ali", "kind": "guest_allowed"}])
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
    assert r.status_code == 400 and "No room videos" in r.json()["detail"]
    (tmp_path / "t.json").write_text(json.dumps({"processedAt": 1.0, "cameras": {
        "h": [{"t": 2.0, "people": [{"name": "unknown", "kind": "unknown"}]}]}}))
    assert client.get("/api/map").json()["timeline"]["duration"] == 4.0   # h offset 2 + 2.0
    engine.in_view = [{"name": "Azhad", "kind": "family"}]
    s = client.get("/api/map/state?t=4.5&live=true").json()
    assert s["intruderRooms"] == ["hall"]
    assert s["rooms"]["living"][0]["name"] == "Azhad"
    assert s["safePaths"] == [{"name": "Azhad", "from": "living", "path": ["living", "front"],
                               "advice": "Leave via Front yard."}]
    assert client.get("/api/map/state").json()["rooms"] == {}
    assert client.get("/api/map/status").json()["state"] == "idle"


def _tiny_video(path, frames=10):
    import cv2
    import numpy as np
    w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 5, (64, 48))
    for i in range(frames):
        w.write(np.full((48, 64, 3), i * 20, np.uint8))
    w.release()
    return path.read_bytes()


def test_timeline_stale_and_offsets():
    tl = {"processedAt": 100.0, "cameras": {"k": [{"t": 0, "people": []}]}}
    assert house.timeline_stale(CFG, {}, {"k": 500.0}) is False        # never processed
    assert house.timeline_stale(CFG, tl, {"k": 50.0, "h": None}) is False
    assert house.timeline_stale(CFG, tl, {"k": 150.0}) is True         # re-uploaded after processing
    assert house.timeline_stale(CFG, tl, {"k": 50.0, "h": 60.0}) is True   # h never processed
    moved = house.set_camera_offset(CFG, "k", "12.5")
    assert next(c for c in moved["cameras"] if c["id"] == "k")["offset"] == 12.5
    assert next(c for c in CFG["cameras"] if c["id"] == "k")["offset"] == 0   # original untouched
    for bad in (-1, 99999, "soon"):
        with pytest.raises(house.MapError):
            house.set_camera_offset(CFG, "k", bad)
    with pytest.raises(house.MapError, match="live"):
        house.set_camera_offset(CFG, "cam-01", 1)
    with pytest.raises(house.MapError, match="no camera"):
        house.set_camera_offset(CFG, "nope", 1)


def test_map_video_upload_and_offset_api(client, tmp_path, monkeypatch):
    monkeypatch.setattr(house, "MAP_FILE", tmp_path / "m.json")
    monkeypatch.setattr(house, "TIMELINE_FILE", tmp_path / "t.json")
    monkeypatch.setattr(house, "VIDEO_DIR", tmp_path / "videos")
    (tmp_path / "m.json").write_text(json.dumps(CFG))
    good = _tiny_video(tmp_path / "src.mp4")

    r = client.post("/api/map/cameras/k/video", files={"video": ("phone clip.mp4", good, "video/mp4")})
    assert r.status_code == 200, r.text
    k = next(c for c in r.json()["cameras"] if c["id"] == "k")
    assert k["videoFound"] is True and k["videoDuration"] == 2.0 and k["videoSizeBytes"] == len(good)
    assert (tmp_path / "videos" / "k.mp4").read_bytes() == good          # saved under the map's name

    # a bad upload keeps the good video
    r = client.post("/api/map/cameras/k/video", files={"video": ("x.mp4", b"not a video", "video/mp4")})
    assert r.status_code == 400 and (tmp_path / "videos" / "k.mp4").read_bytes() == good
    assert client.post("/api/map/cameras/k/video", files={"video": ("x.txt", good, "text/plain")}).status_code == 400
    assert client.post("/api/map/cameras/cam-01/video", files={"video": ("x.mp4", good, "video/mp4")}).status_code == 400
    assert client.post("/api/map/cameras/nope/video", files={"video": ("x.mp4", good, "video/mp4")}).status_code == 404
    assert not list((tmp_path / "videos").glob(".upload_*"))             # no temp files left

    # processed before the upload -> stale
    (tmp_path / "t.json").write_text(json.dumps({"processedAt": 1.0, "cameras": {"k": [{"t": 0, "people": []}]}}))
    assert client.get("/api/map").json()["timeline"]["stale"] is True

    r = client.patch("/api/map/cameras/h", json={"offset": 7.5})
    assert r.status_code == 200 and next(c for c in r.json()["cameras"] if c["id"] == "h")["offset"] == 7.5
    assert json.loads((tmp_path / "m.json").read_text())["cameras"][2]["offset"] == 7.5   # persisted
    assert client.patch("/api/map/cameras/h", json={"offset": -3}).status_code == 400
    assert client.patch("/api/map/cameras/cam-01", json={"offset": 1}).status_code == 400
    assert client.patch("/api/map/cameras/nope", json={"offset": 1}).status_code == 404



def test_cctv_wall_videos(client, tmp_path, monkeypatch):
    monkeypatch.setattr(house, "MAP_FILE", tmp_path / "m.json")
    monkeypatch.setattr(house, "TIMELINE_FILE", tmp_path / "t.json")
    monkeypatch.setattr(house, "VIDEO_DIR", tmp_path / "videos")
    monkeypatch.setattr(house, "ANNOTATED_DIR", tmp_path / "wall")
    (tmp_path / "m.json").write_text(json.dumps(CFG))
    (tmp_path / "wall").mkdir()
    for name in ("h_2.mp4", "h_1.mp4", "k_1.raw.mp4"):
        (tmp_path / "wall" / name).write_bytes(b"x")
    tl = {"processedAt": 1.0, "cameras": {"h": [{"t": 0, "people": []}]},
          "videos": {"h": "h_2.mp4", "k": "k_9.mp4"}}            # k's file is missing
    (tmp_path / "t.json").write_text(json.dumps(tl))
    urls = {c["id"]: c.get("annotatedUrl") for c in client.get("/api/map").json()["cameras"]}
    assert urls == {"cam-01": None, "k": None, "h": "/map_videos/h_2.mp4"}
    house.prune_annotated(tl)                                     # older and half-written files go
    assert sorted(f.name for f in (tmp_path / "wall").iterdir()) == ["h_2.mp4"]


def test_safe_path_advice_uses_via():
    cfg = json.loads(json.dumps(CFG))
    cfg["rooms"][0]["via"] = "the front door"
    occ = {"hall": [{"name": "unknown", "kind": "unknown", "camera": "h"}],
           "living": [{"name": "Azhad", "kind": "family", "camera": "cam-01"}]}
    assert house.plan_safe_paths(cfg, occ)[0]["advice"] == "Leave via the front door."


def test_live_camera_with_a_recording(client, tmp_path, monkeypatch):
    """The live camera may also have a video: uploadable, processed and replayed like a room camera."""
    cfg = json.loads(json.dumps(CFG))
    cfg["cameras"][0]["video"] = "door.mp4"
    house.validate_map(cfg)
    assert house.recorded_camera(cfg, "cam-01")["video"] == "door.mp4"
    assert house.timeline_stale(cfg, {"processedAt": 1.0, "cameras": {"k": []}}, {"cam-01": 5.0}) is True
    monkeypatch.setattr(house, "MAP_FILE", tmp_path / "m.json")
    monkeypatch.setattr(house, "TIMELINE_FILE", tmp_path / "t.json")
    monkeypatch.setattr(house, "VIDEO_DIR", tmp_path / "videos")
    (tmp_path / "m.json").write_text(json.dumps(cfg))
    r = client.post("/api/map/cameras/cam-01/video",
                    files={"video": ("door.mp4", _tiny_video(tmp_path / "src.mp4"), "video/mp4")})
    assert r.status_code == 200, r.text
    door = next(c for c in r.json()["cameras"] if c["id"] == "cam-01")
    assert door["live"] is True and door["videoFound"] is True and door["videoDuration"] == 2.0


def test_map_video_upload_locked_file_409(client, tmp_path, monkeypatch):
    """Windows locks a video the engine is playing: a clear 409, not a 500 (seen by the browser as 'unreachable')."""
    import api
    monkeypatch.setattr(house, "MAP_FILE", tmp_path / "m.json")
    monkeypatch.setattr(house, "VIDEO_DIR", tmp_path / "videos")
    (tmp_path / "m.json").write_text(json.dumps(CFG))

    def locked(src, dst):
        raise PermissionError(32, "The process cannot access the file")
    monkeypatch.setattr(api.os, "replace", locked)
    r = client.post("/api/map/cameras/k/video",
                    files={"video": ("k.mp4", _tiny_video(tmp_path / "src.mp4"), "video/mp4")})
    assert r.status_code == 409 and "in use" in r.json()["detail"]
    assert not list((tmp_path / "videos").glob(".upload_*"))


def test_verify_identity_releases_a_swapped_track():
    v = house.verify_identity
    assert v("unknown", "Raju", 0, 2) == ("Raju", 0)        # first match names the track
    assert v("Raju", "Raju", 1, 2) == ("Raju", 0)           # agreement resets the count
    assert v("Raju", "Chong", 0, 2) == ("Raju", 1)          # one odd check is not enough
    assert v("Raju", "Chong", 1, 2) == ("Chong", 0)         # second in a row: the track is Chong now
    assert v("Raju", "unknown", 1, 2) == ("Raju", 2)        # a turned face is not a stranger yet
    assert v("Raju", "unknown", 5, 2) == ("unknown", 0)     # six unmatched faces in a row are


def test_timeline_stale_when_recognised_people_change(client, engine, tmp_path, monkeypatch):
    assert house.people_changed({"known": ["Chong", "Raju"]}, {"Raju": 1, "Chong": 2}) is False
    assert house.people_changed({"known": ["Chong", "Raju"]}, {"Chong": 2}) is True   # Raju switched off
    assert house.people_changed({}, {"Chong": 2}) is False                            # older timeline
    monkeypatch.setattr(house, "MAP_FILE", tmp_path / "m.json")
    monkeypatch.setattr(house, "TIMELINE_FILE", tmp_path / "t.json")
    monkeypatch.setattr(house, "VIDEO_DIR", tmp_path / "videos")
    (tmp_path / "m.json").write_text(json.dumps(CFG))
    (tmp_path / "t.json").write_text(json.dumps({"processedAt": 1.0, "known": ["Chong", "Raju"],
                                                 "cameras": {"h": [{"t": 0, "people": []}]}}))
    engine.known = {"Chong": 1, "Raju": 2}
    assert client.get("/api/map").json()["timeline"]["stale"] is False
    engine.known = {"Chong": 1}
    assert client.get("/api/map").json()["timeline"]["stale"] is True
