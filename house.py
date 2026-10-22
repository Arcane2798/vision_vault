"""House map + safe path (side features 3 and 4).

A floor plan (house_map.json: rooms, doors between them, rooms that lead outside) with cameras placed
in rooms. A camera is the live camera, a recorded video, or both (the live camera may have a recording
of its own, used in the replay while live mode shows the real feed); recorded videos are processed once
into a timeline of who each camera saw, then replayed together on the map. When an unknown person is
on the map, every resident gets the shortest route to a way out that avoids rooms with an intruder.

Everything except process_videos() is pure, so it is unit-tested without models or a camera.
"""
import bisect
import json
import os
import threading
import time
from collections import deque
from pathlib import Path

MAP_FILE = Path("house_map.json")
TIMELINE_FILE = Path("house_map_timeline.json")
VIDEO_DIR = Path("test_videos")
ANNOTATED_DIR = Path("map_videos")   # processed copies with person boxes, for the CCTV wall
SAMPLE_FPS = 4.0          # frames per second of each recorded video that are analysed
SEEN_WINDOW = 1.5         # a camera sample counts for this many seconds of replay time
MAX_OFFSET = 3600.0       # a camera's video may start up to an hour into the replay


class MapError(ValueError):
    """house_map.json is missing or inconsistent."""


# ---------- floor plan ----------
def load_map(path=None) -> dict:
    path = path or MAP_FILE
    try:
        cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise MapError(f"{path} not found")
    except json.JSONDecodeError as e:
        raise MapError(f"{path} is not valid JSON: {e}")
    validate_map(cfg)
    return cfg


def validate_map(cfg: dict) -> None:
    """Raise MapError unless rooms, doors and cameras are consistent."""
    rooms = cfg.get("rooms")
    if not isinstance(rooms, list) or not rooms:
        raise MapError("the map needs a non-empty 'rooms' list")
    ids = set()
    for r in rooms:
        for key in ("id", "name", "x", "y", "w", "h"):
            if key not in r:
                raise MapError(f"room {r.get('id', '?')!r} is missing {key!r}")
        if r["id"] in ids:
            raise MapError(f"duplicate room id {r['id']!r}")
        ids.add(r["id"])
    if not any(r.get("exit") for r in rooms):
        raise MapError("at least one room must have \"exit\": true (a way out)")
    for d in cfg.get("doors", []):
        if len(d) != 2 or d[0] not in ids or d[1] not in ids:
            raise MapError(f"door {d!r} must join two existing rooms")
    cam_ids = set()
    for c in cfg.get("cameras", []):
        if c.get("id") in cam_ids or not c.get("id"):
            raise MapError(f"camera ids must be unique and non-empty ({c.get('id')!r})")
        cam_ids.add(c["id"])
        if c.get("room") not in ids:
            raise MapError(f"camera {c['id']!r} is in unknown room {c.get('room')!r}")
        if not c.get("live") and not c.get("video"):
            raise MapError(f"camera {c['id']!r} needs \"live\": true or a \"video\" file name")
        # optional drawing hints: position (map units), facing (degrees, 0 = right, 90 = down), fov
        for key in ("x", "y", "facing", "fov"):
            if key in c and not isinstance(c[key], (int, float)):
                raise MapError(f"camera {c['id']!r}: {key!r} must be a number")


def save_map(cfg: dict, path=None) -> None:
    """Validate and write the map (atomically, so a crash never leaves half a file)."""
    validate_map(cfg)
    path = Path(path or MAP_FILE)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def recorded_camera(cfg: dict, cam_id: str) -> dict:
    """The camera with this id that has a recorded video; MapError if missing or live-only."""
    cam = next((c for c in cfg.get("cameras", []) if c.get("id") == cam_id), None)
    if cam is None:
        raise MapError(f"no camera {cam_id!r} in the map")
    if not cam.get("video"):
        raise MapError(f"{cam['name']} is the live camera: it has no recorded video")
    return cam


def set_camera_offset(cfg: dict, cam_id: str, offset) -> dict:
    """A copy of the map with this recorded camera's video starting `offset` seconds into the replay."""
    try:
        offset = float(offset)
    except (TypeError, ValueError):
        raise MapError("offset must be a number of seconds")
    if not 0 <= offset <= MAX_OFFSET:
        raise MapError(f"offset must be between 0 and {int(MAX_OFFSET)} seconds")
    recorded_camera(cfg, cam_id)
    out = dict(cfg)
    out["cameras"] = [dict(c, offset=round(offset, 2)) if c.get("id") == cam_id else c
                      for c in cfg.get("cameras", [])]
    return out


def timeline_stale(cfg: dict, timeline: dict, video_mtimes: dict) -> bool:
    """True when a recorded camera's video changed (or appeared) after the last processing.
    `video_mtimes` is {cam_id: mtime or None}. Offsets never make it stale (applied at replay)."""
    cams = timeline.get("cameras") or {}
    if not cams:
        return False                       # never processed: a different state, not "stale"
    processed = timeline.get("processedAt") or 0
    for c in cfg.get("cameras", []):
        if not c.get("video"):
            continue
        m = video_mtimes.get(c["id"])
        if m is not None and (m > processed or c["id"] not in cams):
            return True
    return False


def neighbours(doors) -> dict:
    graph = {}
    for a, b in doors:
        graph.setdefault(a, set()).add(b)
        graph.setdefault(b, set()).add(a)
    return graph


def safe_path(doors, start, exits, blocked):
    """Shortest list of room ids from `start` to any room in `exits` that never enters a room in
    `blocked` (the start itself may be blocked: you can always try to leave the room you are in).
    None if every way out goes through an intruder."""
    graph = neighbours(doors)
    exits, blocked = set(exits), set(blocked)
    if start in exits and start not in blocked:
        return [start]
    prev = {start: None}
    queue = deque([start])
    while queue:
        room = queue.popleft()
        for nxt in sorted(graph.get(room, ())):
            if nxt in prev or nxt in blocked:
                continue
            prev[nxt] = room
            if nxt in exits:
                path = [nxt]
                while prev[path[-1]] is not None:
                    path.append(prev[path[-1]])
                return path[::-1]
            queue.append(nxt)
    return None


def plan_safe_paths(cfg: dict, occupancy: dict) -> list:
    """For every resident on the map: the safe route out, or advice to stay put.
    `occupancy` is {room_id: [{name, kind, camera}]}."""
    names = {r["id"]: r["name"] for r in cfg["rooms"]}
    via = {r["id"]: r.get("via", r["name"]) for r in cfg["rooms"]}   # e.g. "the front door"
    exits = [r["id"] for r in cfg["rooms"] if r.get("exit")]
    blocked = {room for room, people in occupancy.items()
               if any(p["kind"] == "unknown" for p in people)}
    if not blocked:
        return []
    plans = []
    for room, people in sorted(occupancy.items()):
        for p in people:
            if p["kind"] != "family":
                continue
            path = safe_path(cfg.get("doors", []), room, exits, blocked)
            if path is None:
                advice = (f"No safe way out. Stay in the {names[room]}, lock the door and wait for the "
                          f"guard house.")
            elif len(path) == 1:
                advice = f"Already outside ({names[room]}). Move away from the house."
            else:
                advice = "Leave via " + " → ".join(via[r] for r in path[1:]) + "."
                if room in blocked:
                    advice = f"The intruder is in the {names[room]} with you. " + advice
            plans.append({"name": p["name"], "from": room, "path": path, "advice": advice})
    return plans


# ---------- recorded-video timeline ----------
def occupancy_at(cfg: dict, timeline: dict, t: float, window: float = SEEN_WINDOW) -> dict:
    """{room_id: [{name, kind, camera}]} at replay time t: each recorded camera contributes its
    latest sample not older than `window` seconds. Sample times are seconds into that camera's
    video; the camera's `offset` (from the map, so it can be edited without re-processing)
    shifts its video on the shared replay clock."""
    occ = {}
    cams = {c["id"]: c for c in cfg.get("cameras", [])}
    for cam_id, samples in (timeline.get("cameras") or {}).items():
        cam = cams.get(cam_id)
        if cam is None or not samples:
            continue
        local = t - float(cam.get("offset", 0))
        times = [s["t"] for s in samples]
        i = bisect.bisect_right(times, local) - 1
        if i < 0 or local - times[i] > window:
            continue
        for p in samples[i]["people"]:
            occ.setdefault(cam["room"], []).append({"name": p["name"], "kind": p["kind"], "camera": cam_id})
    return occ


def merge_live(cfg: dict, occ: dict, in_view) -> dict:
    """Add the live camera's people (engine get_status()["in_view"]) to its room."""
    live = next((c for c in cfg.get("cameras", []) if c.get("live")), None)
    if live is None:
        return occ
    occ = {k: list(v) for k, v in occ.items()}
    for p in in_view:
        kind = {"guest_allowed": "guest", "guest_outside": "guest"}.get(p["kind"], p["kind"])
        if kind == "leaving":
            continue
        occ.setdefault(live["room"], []).append({"name": p["name"], "kind": kind, "camera": live["id"]})
    return occ


def timeline_duration(timeline: dict, cfg=None) -> float:
    """Length of the replay: the latest sample of any camera, shifted by its offset."""
    offsets = {c["id"]: float(c.get("offset", 0)) for c in (cfg or {}).get("cameras", [])}
    return max((offsets.get(cam, 0.0) + s[-1]["t"]
                for cam, s in (timeline.get("cameras") or {}).items() if s), default=0.0)


def load_timeline(path=None) -> dict:
    path = path or TIMELINE_FILE
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


# ---------- processing (needs the models; runs in a background thread) ----------
class MapProcessor:
    """Runs recorded map videos through person detection + face recognition once."""

    def __init__(self):
        self.lock = threading.Lock()
        self.state = {"state": "idle", "progress": 0.0, "camera": None, "error": None,
                      "processedAt": load_timeline().get("processedAt")}

    def status(self):
        with self.lock:
            return dict(self.state)

    def _set(self, **kw):
        with self.lock:
            self.state.update(kw)

    def start(self, engine, cfg) -> bool:
        with self.lock:
            if self.state["state"] == "processing":
                return False
            self.state.update(state="processing", progress=0.0, camera=None, error=None)
        threading.Thread(target=self._run, args=(engine, cfg), daemon=True).start()
        return True

    def _run(self, engine, cfg):
        try:
            timeline = process_videos(engine, cfg, progress=lambda cam, p: self._set(camera=cam, progress=p))
            TIMELINE_FILE.write_text(json.dumps(timeline), encoding="utf-8")
            self._set(state="done", progress=1.0, camera=None, processedAt=timeline["processedAt"])
        except Exception as e:      # shown on the map page
            self._set(state="error", error=str(e))
        finally:
            prune_annotated(load_timeline())


def annotated_file(timeline: dict, cam_id: str):
    """Path of this camera's processed video (person boxes drawn) if it exists, else None."""
    name = (timeline.get("videos") or {}).get(cam_id)
    path = ANNOTATED_DIR / name if name else None
    return path if path and path.is_file() else None


def prune_annotated(timeline: dict) -> None:
    """Delete processed videos the timeline no longer uses (best effort: a file the browser is
    still streaming may be locked on Windows; it goes on the next run)."""
    keep = set((timeline.get("videos") or {}).values())
    for f in ANNOTATED_DIR.glob("*.mp4") if ANNOTATED_DIR.is_dir() else ():
        if f.name not in keep:
            try:
                f.unlink()
            except OSError:
                pass


def process_videos(engine, cfg, progress=lambda cam, p: None) -> dict:
    """{processedAt, cameras: {cam_id: [{t, people: [{name, kind}]}]}, videos: {cam_id: file}} for
    every recorded camera. `videos` are copies in ANNOTATED_DIR with the person boxes drawn (same
    timing as the original), played on the House map's CCTV wall.
    Uses the engine's face model and enrolled faces; a separate YOLO instance does the tracking."""
    import cv2
    from ultralytics import YOLO
    import engine as eng
    from vault_utils import encode_h264
    from rules import FAMILY, GUEST_ALLOWED, GUEST_OUTSIDE, classify_person, security_params

    # rooms without a video yet are skipped (they stay empty on the map)
    recorded = [c for c in cfg.get("cameras", [])
                if c.get("video") and (VIDEO_DIR / Path(c["video"]).name).is_file()]
    if not recorded:
        raise MapError("no room videos uploaded yet")
    with engine.lock:
        known, people = engine.known, engine.people
    on = security_params("on")
    thresh = on["match_thresh"]
    kind_of = {FAMILY: "family", GUEST_ALLOWED: "guest", GUEST_OUTSIDE: "guest"}
    out, videos, stamp = {}, {}, int(time.time())
    ANNOTATED_DIR.mkdir(exist_ok=True)
    for n, cam in enumerate(recorded):
        path = VIDEO_DIR / Path(cam["video"]).name
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            raise MapError(f"camera {cam['id']!r}: cannot open video {path}")
        src_fps = cap.get(cv2.CAP_PROP_FPS) or 25
        total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 1
        step = max(1, round(src_fps / SAMPLE_FPS))
        yolo = YOLO("yolov8n.pt")
        identity, samples, idx = {}, [], 0
        boxes = []                # [(x1, y1, x2, y2, colour, label)] from the latest analysed frame
        raw = ANNOTATED_DIR / f"{cam['id']}_{stamp}.raw.mp4"
        writer = None
        while True:
            ok, full = cap.read()
            if not ok:
                break
            idx += 1
            if full.shape[1] > eng.CAPTURE_W:
                full = cv2.resize(full, (eng.CAPTURE_W, int(full.shape[0] * eng.CAPTURE_W / full.shape[1])))
            frame = cv2.resize(full, (eng.PROCESS_W, int(full.shape[0] * eng.PROCESS_W / full.shape[1])))
            if writer is None:
                writer = cv2.VideoWriter(str(raw), cv2.VideoWriter_fourcc(*"mp4v"), src_fps,
                                         (frame.shape[1], frame.shape[0]))
            if (idx - 1) % step:
                _draw_boxes(cv2, frame, boxes)   # frames between analyses keep the last boxes
                writer.write(frame)
                continue
            scale = full.shape[1] / frame.shape[1]
            res = yolo.track(frame, classes=[0], conf=on["person_conf"], persist=True,
                             tracker="bytetrack.yaml", verbose=False)[0]
            seen, boxes = [], []
            if res.boxes.id is not None:
                for (x1, y1, x2, y2), tid in zip(res.boxes.xyxy.cpu().numpy().astype(int),
                                                 res.boxes.id.int().cpu().tolist()):
                    if identity.get(tid, "unknown") == "unknown":
                        crop = full[int(y1 * scale):int((y1 + (y2 - y1) * 0.55) * scale),
                                    int(x1 * scale):int(x2 * scale)]
                        faces = [f for f in (engine.face_app.get(crop) if crop.size else [])
                                 if f.det_score >= eng.MIN_DET_SCORE
                                 and f.bbox[2] - f.bbox[0] >= eng.MIN_FACE_PX]
                        if faces:
                            best = max(faces, key=lambda f: f.bbox[2] - f.bbox[0])
                            identity[tid] = engine._identify(best.normed_embedding, known, thresh)[0]
                    name = identity.get(tid, "unknown")
                    decision = classify_person(name, people.get(name), time.time())
                    seen.append({"name": name, "kind": kind_of.get(decision, "unknown")})
                    colour, label = eng.STYLE[decision]
                    boxes.append((x1, y1, x2, y2, colour, label.format(name=name)))
            _draw_boxes(cv2, frame, boxes)
            writer.write(frame)
            # seconds into this video; the camera's offset is applied at replay (occupancy_at)
            samples.append({"t": round((idx - 1) / src_fps, 2), "people": seen})
            progress(cam["id"], (n + min(1.0, idx / total)) / len(recorded))
        cap.release()
        out[cam["id"]] = samples
        if writer is not None:
            writer.release()
            final = raw.with_name(f"{cam['id']}_{stamp}.mp4")
            try:
                encode_h264(raw, final)      # mp4v does not play in browsers
                videos[cam["id"]] = final.name
            except Exception as e:           # the map replay still works without the wall video
                print(f"[map] could not encode the CCTV video for {cam['id']}: {e}")
            raw.unlink(missing_ok=True)
    return {"processedAt": time.time(), "cameras": out, "videos": videos}


def _draw_boxes(cv2, frame, boxes):
    for x1, y1, x2, y2, colour, label in boxes:
        cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
        cv2.putText(frame, label, (x1, max(18, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, colour, 2)
