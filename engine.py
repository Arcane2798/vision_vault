import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import pickle
import threading
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO
from insightface import model_zoo
from insightface.app.common import Face
from insightface.utils.storage import ensure_available

from rules import (DEFAULT_LEVEL,
                   FAMILY, GUEST_ALLOWED, GUEST_OUTSIDE, SECURITY_LEVELS,
                   UNKNOWN, classify_person, effective_level, guard_alert_due,
                   is_departing, items_near, match_lost_unknown, items_text, movement_direction,
                   normalize_level, security_params, should_alert_guard, stale_tracks)
from vault_utils import (CAMERA_NAME, CLIP_DIR, FACES_DIR, SNAP_DIR,
                         ClipRecorder, env, get_settings, guard_chat_id, guard_token, house_unit,
                         init_db, load_people, log_event, log_movement, send_telegram,
                         set_event_items,
                         set_settings, sync_people)

VERIFY_INTERVAL = 30      # frames between re-checks of an already-recognized person
VERIFY_FAILS = 2          # consecutive mismatches before the lock is released

# ---- vision settings (.env). VISION_MODE=legacy restores the pre-Wed-21-Oct behaviour. ----
# Faces are cropped from the full capture (1280x720) while YOLO, drawing and streaming use a
# 640-wide copy, so a face at the door has about 2x the pixels. Face detection uses buffalo_s's
# fast detector; recognition uses buffalo_l's ResNet-50 (much more accurate, ~110 ms per check
# on an i7-10510U vs 262 ms for the old full buffalo_s pipeline, which also ran unused models).
LEGACY = (env("VISION_MODE", "") or "").lower() == "legacy"
FACE_DETECTOR = env("FACE_DETECTOR", "buffalo_s")                          # det_500m
FACE_RECOGNIZER = env("FACE_RECOGNIZER", "buffalo_s" if LEGACY else "buffalo_l")
CAPTURE_W, CAPTURE_H = (int(v) for v in
                        (env("CAPTURE_SIZE", "640x480" if LEGACY else "1280x720")).lower().split("x"))
PROCESS_W = 640           # YOLO / overlay / stream / clip width
# Person detector. OpenVINO runs yolo11s ~2x faster than PyTorch on this Intel CPU; the export
# (yolo11s_<h>x<w>_openvino_model/, git-ignored) is made once on first start. DETECTOR_IMGSZ = YOLO input size.
DETECTOR_MODEL = env("DETECTOR_MODEL", "yolo11s.pt")
DETECTOR_BACKEND = (env("DETECTOR_BACKEND", "openvino") or "openvino").lower()
DETECTOR_IMGSZ = int(env("DETECTOR_IMGSZ", "832"))   # best detection at >= 8 FPS (see AGENTS.md)
DETECTOR_DEVICE = (env("DETECTOR_DEVICE", "gpu") or "gpu").lower()   # OpenVINO: gpu (Intel iGPU) | cpu
# frames between face checks while a person is unknown: any match during the grace period
# cancels the alert, so more looks = fewer false alarms on residents, no extra delay for intruders
FACE_REC_INTERVAL = int(env("FACE_CHECK_FRAMES", "8" if LEGACY else "3"))

# GRACE / MATCH_THRESH depend on the security level: see rules.security_params
TG_COOLDOWN = 15.0        # min seconds between Telegram messages of the same event type
CLIP_PRE_SEC = 5          # seconds of video kept before an event
CLIP_POST_SEC = 5         # seconds recorded after the (last) event; clips use the measured FPS
IMG_EXT = {".jpg", ".jpeg", ".png"}

# Intruder's items (feature 10): COCO classes YOLOv8n already knows, found in the same pass as
# people. A prototype: the nano model misses many knives, so a hit is a strong hint, a miss
# proves nothing. Items need a lower confidence than people to be found at all.
ITEM_CLASSES = {34: "baseball bat", 43: "knife", 76: "scissors"}
ITEM_CONF = 0.25
# Paused Wed 21 Oct (owner: focus on detecting people and recognising faces). ITEM_DETECTION=1 turns it back on.
ITEM_DETECTION = env("ITEM_DETECTION", "0") == "1"
DETECT_CLASSES = [0, *ITEM_CLASSES] if ITEM_DETECTION else [0]
ITEM_COLOR = (255, 0, 255)   # magenta (BGR)
# ByteTrack keeps following a known person through weak detections (bending over, blur, busy
# background), so the tracker gets boxes down to TRACK_LOW_CONF. A track only counts as a person
# once one of its detections reached the level's person_conf ("confirmed").
TRACK_LOW_CONF = 0.1
MIN_TRACK_FRAMES = 3     # default when On; per level: rules.security_params
# ignore faces narrower than this, in capture pixels. Was 40, which skipped every face in the
# corner-CCTV room videos (faces 13-30 px). Tested Thu 22 Oct: 16+ px faces still pick the right
# person, and other people stay below 0.30, so the match threshold keeps strangers out.
MIN_FACE_PX = 16
MIN_DET_SCORE = 0.6      # ignore low-confidence face detections

# Family tracker (camera inside, facing the door): box growing = arriving, shrinking = leaving.
# DEPARTURE_FILTER: an unknown who starts close to the camera and walks away (a resident leaving,
# face never seen) is logged as "someone left" instead of raising an intrusion.
# Paused Wed 21 Oct: it hid a real intruder walking away from a living-room camera. DEPARTURE_FILTER=1 turns it back on.
DEPARTURE_FILTER = env("DEPARTURE_FILTER", "0") == "1"
TRACK_END_SEC = 2.0      # a track unseen this long has left the view: decide arrived / left
SIZE_SAMPLES = 5         # first / last box heights kept per track for the direction
LEAVING_COLOR = (200, 200, 200)

TRAIL_LEN = 60           # foot points kept per track for the path trail (~8 s at 7 fps)
TRACK_FORGET_SEC = 30.0  # drop all state of a track not seen for this long (bounded memory)
PRUNE_INTERVAL = 5.0     # seconds between stale-track sweeps

LEVEL_COLOR = {"off": (170, 170, 170), "on": (0, 255, 0)}  # BGR
LEVEL_CHECK_INTERVAL = 1.0   # seconds between Off-timer re-checks
_UNSET = object()            # "argument not given" (None means "clear")

# box colour (BGR) and label per decision; see rules.classify_person
STYLE = {
    FAMILY:        ((0, 255, 0),   "{name}"),                       # green
    GUEST_ALLOWED: ((255, 255, 0), "guest:{name}"),                 # cyan
    GUEST_OUTSIDE: ((0, 165, 255), "guest:{name} (outside time)"),  # orange
    UNKNOWN:       ((0, 0, 255),   "unknown"),                      # red
}
FACE_BOX_COLOR = (255, 255, 255)
# kind names in get_status()["in_view"] / peopleInView: family, guest_allowed, guest_outside, unknown
VIEW_KIND = {GUEST_OUTSIDE: "guest_outside"}


def detector_shape(imgsz):
    """(h, w) YOLO input for a 16:9 camera: `imgsz` wide, height rounded up to a multiple of 32
    (640 -> 384x640). A rectangular export does ~40% less work than a square one."""
    return -(-imgsz * 9 // 16 // 32) * 32, imgsz


def load_detector(model=DETECTOR_MODEL, backend=DETECTOR_BACKEND, imgsz=DETECTOR_IMGSZ,
                  device=DETECTOR_DEVICE):
    """(YOLO person detector, extra predict/track kwargs). OpenVINO export if backend is
    "openvino" (exported once if missing) on the Intel GPU when there is one, else the CPU;
    any OpenVINO failure falls back to the PyTorch .pt model with a warning."""
    if backend == "openvino":
        h, w = detector_shape(imgsz)
        folder = Path(f"{Path(model).stem}_{h}x{w}_openvino_model")   # suffix tells YOLO the format
        try:
            import openvino as ov
            dev = "GPU" if device == "gpu" and "GPU" in ov.Core().available_devices else "CPU"
            if not (folder / "metadata.yaml").exists():
                print(f"[detector] exporting {model} to OpenVINO at {h}x{w} (once, ~1 min)...")
                out = Path(YOLO(model).export(format="openvino", imgsz=[h, w], verbose=False))
                if out.resolve() != folder.resolve():
                    if folder.exists():
                        import shutil
                        shutil.rmtree(folder)
                    out.rename(folder)
            det = YOLO(str(folder), task="detect")
            kwargs = {"imgsz": [h, w], "device": f"intel:{dev.lower()}"}
            det.predict(np.zeros((h, w, 3), np.uint8), verbose=False, **kwargs)   # compile (GPU ~12 s)
            print(f"[detector] {model} on OpenVINO {dev}, input {h}x{w}")
            return det, kwargs
        except Exception as e:
            print(f"[detector] WARNING: OpenVINO unavailable ({e}); using PyTorch {model}")
    elif backend != "pytorch":
        print(f"[detector] WARNING: unknown DETECTOR_BACKEND {backend!r}; using PyTorch")
    print(f"[detector] {model} on PyTorch CPU, imgsz {imgsz}")
    return YOLO(model), {"imgsz": imgsz}


class FaceModel:
    """Face detector + recogniser with the FaceAnalysis.get() interface the engine uses.
    Only detection and recognition run (no landmark / age / gender models)."""

    def __init__(self, detector_pack=FACE_DETECTOR, recognizer_pack=FACE_RECOGNIZER):
        det_dir = ensure_available("models", detector_pack, root="~/.insightface")
        rec_dir = det_dir if recognizer_pack == detector_pack else \
            ensure_available("models", recognizer_pack, root="~/.insightface")
        self.det = model_zoo.get_model(self._find(det_dir, "det_"), providers=["CPUExecutionProvider"])
        self.det.prepare(ctx_id=-1, input_size=(320, 320), det_thresh=0.5)
        self.rec = model_zoo.get_model(self._find(rec_dir, "w600k"), providers=["CPUExecutionProvider"])
        self.rec.prepare(ctx_id=-1)
        self.name = recognizer_pack       # embeddings are only comparable within one recogniser
        print(f"[faces] detector {detector_pack}, recogniser {recognizer_pack}")

    @staticmethod
    def _find(folder, prefix):
        for f in sorted(os.listdir(folder)):
            if f.startswith(prefix) and f.endswith(".onnx"):
                return os.path.join(folder, f)
        raise FileNotFoundError(f"no {prefix}*.onnx in {folder}")

    def get(self, img):
        bboxes, kpss = self.det.detect(img, max_num=0, metric="default")
        faces = []
        for i in range(bboxes.shape[0]):
            face = Face(bbox=bboxes[i, :4], kps=kpss[i] if kpss is not None else None,
                        det_score=bboxes[i, 4])
            self.rec.get(img, face)
            faces.append(face)
        return faces


class VisionEngine:
    def __init__(self, source=0, camera_name=CAMERA_NAME):
        self.source = source
        self.is_file = isinstance(source, str)
        self.default_source = source   # what "back to camera" returns to (VIDEO_SOURCE)
        self.loop_file = self.is_file  # VIDEO_SOURCE files loop; test videos play once
        self._new_source = None        # (source, loop) requested by set_source(); applied in _loop
        self.finished = False          # a play-once test video reached its end
        self.progress = None           # 0..1 position in a video file, None for a camera
        self.camera_name = camera_name

        # Lightweight person detector; face detector + recogniser (see FaceModel)
        self.detector, self.detect_kwargs = load_detector()
        self.face_app = FaceModel()

        self.faces_path = Path(FACES_DIR)
        # one cache per recogniser: switching models (or VISION_MODE=legacy) never mixes embeddings
        self.cache_file = self.faces_path / ("embeddings.pkl" if self.face_app.name == "buffalo_s"
                                             else f"embeddings_{self.face_app.name}.pkl")
        self.known = {}           # name -> (n, 512) embeddings; swapped whole under self.lock
        self.people = {}          # name -> people row; swapped whole under self.lock
        self._reload_lock = threading.Lock()   # serialises reload_people() calls
        self.last_seen = {}       # name -> epoch of last frame a known person was in view (self.lock)

        # security level ("on" / "off") and the Off timer (epoch),
        # all under self.lock; loaded from settings in start()
        self.security = {"level": DEFAULT_LEVEL,
                         "off_until": None,              # level "off" ends then (None = until turned on)
                         "updated_at": None}
        self.level = DEFAULT_LEVEL           # effective level used by the rules
        self.params = security_params(DEFAULT_LEVEL)
        self._next_level_check = 0.0

        self.recorder = ClipRecorder(pre_sec=CLIP_PRE_SEC, post_sec=CLIP_POST_SEC)
        self.identity = {}        # track_id -> name (locked once recognized)
        self.last_faces = {}      # track_id -> [((x1,y1,x2,y2), name, score)]
        self.last_checked = {}    # track_id -> frame_count of last face check
        self.verify_fail = {}     # track_id -> consecutive re-check mismatches
        self.unknown_since = {}   # track_id -> first time seen as unknown
        self.alerted = set()      # track_ids that raised an intrusion
        self.guest_alerted = set()  # track_ids that raised guest_outside_window
        self.last_tg = {}         # event_type -> time of last Telegram message

        self.lock = threading.Lock()
        self.latest_jpeg = None
        self.unknown_count = 0
        self.in_view = []         # [{name, kind}] for the latest frame (self.lock)
        self.fps = 0.0
        self.running = False
        self.thread = None

        self.track_age = {}      # track_id -> frames seen
        self.confirmed = set()   # track_ids with at least one detection >= the level's person_conf
        self.trails = {}         # track_id -> deque of foot points (x, y) in frame coords
        self.track_items = {}    # track_id -> set of item labels seen near this unknown person
        self.track_event = {}    # track_id -> events.id of its intrusion (to add late items)
        self.size_hist = {}      # track_id -> ([first heights], deque[last heights]) as frame fractions
        self.track_names = {}    # track_id -> last known person recognised on this track
        self.departing = set()   # unknown tracks judged "someone leaving" (no alert)
        self.closed = set()      # tracks already judged arrived / left
        self.track_seen = {}     # track_id -> last time the track was in a frame
        self.last_box = {}       # track_id -> last (x1, y1, x2, y2) in frame coords (timer carry-over)
        self._next_prune = 0.0


    # ---------- enrollment (with per-person disk caching) ----------
    @staticmethod
    def _folder_signature(person_dir):
        """File names + mtimes + sizes of a person's photos; changes when photos change."""
        return tuple(sorted((p.name, p.stat().st_mtime_ns, p.stat().st_size)
                            for p in person_dir.iterdir()
                            if p.is_file() and p.suffix.lower() in IMG_EXT))

    def _embed_image(self, img):
        """Normed embedding of the largest face in `img`, or None if no face is found."""
        h, w = img.shape[:2]
        if max(h, w) > 1080:
            scale = 1080 / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)))
        detected = self.face_app.get(img)
        if not detected:
            return None
        best = max(detected, key=lambda f:
                   (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return best.normed_embedding

    def has_face(self, img):
        """True if InsightFace finds a face in `img` (used to validate uploaded photos)."""
        return self._embed_image(img) is not None

    def _embed_folder(self, person_dir):
        embs = []
        for img_path in sorted(person_dir.iterdir()):
            if img_path.suffix.lower() not in IMG_EXT:
                continue
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            emb = self._embed_image(img)
            if emb is not None:
                embs.append(emb)
        return np.stack(embs) if embs else None   # keep every photo

    def _load_cache(self):
        """{name: {"sig": tuple, "embs": ndarray|None}}; old/corrupt caches are ignored."""
        if not self.cache_file.exists():
            return {}
        try:
            with open(self.cache_file, "rb") as f:
                cache = pickle.load(f)
        except Exception as e:
            print("[faces] cache unreadable, recomputing:", e)
            return {}
        if not isinstance(cache, dict):
            return {}
        return {k: v for k, v in cache.items()
                if isinstance(v, dict) and "sig" in v and "embs" in v}

    def _load_known(self):
        """Embeddings per person. Only folders whose photos changed are recomputed."""
        self.faces_path.mkdir(parents=True, exist_ok=True)
        cache = self._load_cache()
        new_cache, changed = {}, False
        for person_dir in sorted(self.faces_path.iterdir()):
            if not person_dir.is_dir():
                continue
            name = person_dir.name
            sig = self._folder_signature(person_dir)
            entry = cache.get(name)
            if entry is None or entry["sig"] != sig:
                entry = {"sig": sig, "embs": self._embed_folder(person_dir)}
                changed = True
                n = 0 if entry["embs"] is None else len(entry["embs"])
                print(f"[faces] enrolled {name}: {n} face(s) from {len(sig)} photo(s)")
            new_cache[name] = entry
        if set(new_cache) != set(cache):
            changed = True              # a folder was added or removed
        if changed:
            try:
                with open(self.cache_file, "wb") as f:
                    pickle.dump(new_cache, f)
            except Exception as e:
                print("[faces] could not save cache:", e)
        known = {k: v["embs"] for k, v in new_cache.items() if v["embs"] is not None}
        if known:
            print("[faces] known people:", list(known))
        else:
            print("[faces] no faces enrolled. Check the faces/ folder and photo formats.")
        return known

    def reload_people(self):
        """Re-read faces/ and the people table (the API calls this after changes).

        Slow embedding work happens outside self.lock; only the swap is locked.
        """
        with self._reload_lock:
            sync_people(self.faces_path)
            known = self._load_known()
            people = load_people()
            # recognition switched off on the People page: leave their faces out, so they are unknown
            off = {n for n in known if not people.get(n, {}).get("recognition", 1)}
            if off:
                print("[faces] recognition off:", sorted(off))
                known = {n: e for n, e in known.items() if n not in off}
            with self.lock:
                self.known = known
                self.people = people

    # ---------- security level ----------
    def _load_security(self):
        stored = get_settings()
        sec = dict(self.security)
        level = normalize_level(stored.get("security_level", (None,))[0])
        if level in SECURITY_LEVELS:
            sec["level"] = level
        try:
            raw = stored.get("off_until", ("",))[0]
            sec["off_until"] = float(raw) if raw else None
        except ValueError:
            sec["off_until"] = None
        times = [stored[k][1] for k in ("security_level", "off_until")
                 if k in stored and stored[k][1]]
        sec["updated_at"] = max(times) if times else None
        with self.lock:
            self.security = sec
        self._refresh_level(time.time())

    def _refresh_level(self, now):
        """Recompute the effective level (Off timer) and its thresholds."""
        with self.lock:
            s = self.security
            expired = s["level"] == "off" and effective_level("off", now, s["off_until"]) == "on"
        if expired:
            # the Off timer ran out: back to On (persisted)
            print("[security] Off timer ended -> on")
            self.set_security(level="on")
            return
        with self.lock:
            s = self.security
            level = effective_level(s["level"], now, s["off_until"])
            if level != self.level:
                print(f"[security] effective level -> {level}")
            self.level = level
            self.params = security_params(level)
            self._next_level_check = now + LEVEL_CHECK_INTERVAL

    def set_security(self, level=None, off_until=_UNSET):
        """Change the level ("on" / "off") and/or the Off timer, persist, apply at once.
        `off_until` is an epoch; None = Off until turned back on, omitted = unchanged.
        Old levels ("normal", "high", ...) mean "on". Raises ValueError on an unknown level
        or an Off timer that is not in the future or is given without level "off"."""
        if level is not None:
            level = normalize_level(level)
            if level not in SECURITY_LEVELS:
                raise ValueError(f"level must be one of {', '.join(SECURITY_LEVELS)}")
        with self.lock:
            current = self.security["level"]
        target = level if level is not None else current
        if off_until is not _UNSET:
            if target != "off":
                raise ValueError("an Off timer only applies when the level is Off")
            if off_until is not None and off_until <= time.time():
                raise ValueError("the Off timer must end in the future")
        changes = {}
        if level is not None:
            changes["security_level"] = level
            if level == "off":
                if off_until is _UNSET:
                    off_until = None            # no timer given: off until turned back on
            else:
                off_until = None                # leaving Off clears its timer
        if off_until is not _UNSET:
            changes["off_until"] = "" if off_until is None else repr(float(off_until))
        if changes:
            updated = set_settings(changes)
            with self.lock:
                s = self.security
                if level is not None:
                    s["level"] = level
                if off_until is not _UNSET:
                    s["off_until"] = off_until
                s["updated_at"] = updated
            self._refresh_level(time.time())
        return self.get_security()

    def set_security_level(self, level):
        return self.set_security(level=level)

    def get_security(self):
        """{level, off_until, updated_at, effective_level}. An Off timer that has passed
        reads (and is saved as) "on" straight away, not at the loop's next check."""
        now = time.time()
        with self.lock:
            s = self.security
            stale = s["level"] == "off" and effective_level("off", now, s["off_until"]) == "on"
        if stale:
            self._refresh_level(now)
        with self.lock:
            return dict(self.security, effective_level=self.level)

    def _identify(self, emb, known, thresh):
        best, best_score = "unknown", 0.0
        for name, refs in known.items():
            score = float(np.max(refs @ emb))
            if score > best_score:
                best, best_score = name, score
        return (best if best_score > thresh else "unknown"), best_score

    # ---------- control ----------
    def start(self):
        init_db()
        self.reload_people()
        self._load_security()
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=3)

    def get_jpeg(self):
        with self.lock:
            return self.latest_jpeg

    def get_last_seen(self):
        """{name: epoch} of when each known person was last in view (this run only)."""
        with self.lock:
            return dict(self.last_seen)

    def get_status(self):
        with self.lock:
            return {"camera": self.camera_name,
                    "running": self.running,
                    "unknown_count": self.unknown_count,
                    "in_view": [dict(p) for p in self.in_view],
                    "fps": round(self.fps, 1),
                    "security_level": self.level}

    # ---------- video source (camera or a recorded test video) ----------
    def set_source(self, path=None):
        """Play a video file once (path), or go back to the configured source (None).
        Applied by the loop thread at its next frame; replaying the same path restarts it."""
        with self.lock:
            if path is None:
                self._new_source = (self.default_source, isinstance(self.default_source, str))
            else:
                self._new_source = (str(path), False)
            self.finished = False

    def get_source(self):
        with self.lock:
            pending = self._new_source
            source, is_file = (pending[0], isinstance(pending[0], str)) if pending else (self.source, self.is_file)
            return {"source": source, "is_file": is_file,
                    "is_default": source == self.default_source,
                    "finished": self.finished and not pending,
                    "progress": None if pending else self.progress}

    @staticmethod
    def _open(source):
        if isinstance(source, str):
            cap = cv2.VideoCapture(source)
        else:
            # Windows' default MSMF backend can open a webcam yet never deliver frames; DirectShow is reliable
            backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY
            cap = cv2.VideoCapture(source, backend)
        if not cap.isOpened():
            print(f"[camera] could not open video source {source!r}")
        if not isinstance(source, str):
            # MJPG keeps USB webcams (e.g. the C922) at full frame rate at 720p
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAPTURE_W)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAPTURE_H)
        if not isinstance(source, str):
            print(f"[camera] capturing at {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x"
                  f"{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
        return cap

    def _track_stores(self):
        """Every per-track dict / set (keyed by ByteTrack id)."""
        return (self.identity, self.last_faces, self.last_checked, self.verify_fail,
                self.unknown_since, self.track_age, self.trails, self.track_seen,
                self.track_items, self.track_event, self.size_hist, self.track_names, self.last_box,
                self.departing, self.closed, self.alerted, self.guest_alerted, self.confirmed)

    def _forget_tracks(self, tids):
        for store in self._track_stores():
            for tid in tids:
                if isinstance(store, dict):
                    store.pop(tid, None)
                else:
                    store.discard(tid)

    def _reset_tracks(self):
        """Forget every track: a new source restarts ByteTrack ids at 1."""
        for store in self._track_stores():
            store.clear()
        predictor = getattr(self.detector, "predictor", None)
        for tracker in getattr(predictor, "trackers", None) or []:
            tracker.reset()

    def _finish_clip(self, last_frame):
        """Complete a clip still recording post-roll by repeating the last frame."""
        while self.recorder.writer is not None and last_frame is not None:
            self.recorder.add(last_frame)

    # ---------- main loop ----------
    def _loop(self):
        cap = self._open(self.source)
        failed_reads = 0
        last_frame = None

        frame_count = 0
        fps = 0.0
        prev_time = time.time()

        src_fps = cap.get(cv2.CAP_PROP_FPS) or 25
        frame_delay = 1.0 / src_fps
        total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) if self.is_file else 0
        play_start = time.time()

        while self.running:
            with self.lock:
                request, self._new_source = self._new_source, None
            if request:
                self._finish_clip(last_frame)
                self.recorder.buffer.clear()     # pre-roll from the old source
                cap.release()
                source, loop = request
                cap = self._open(source)
                src_fps = cap.get(cv2.CAP_PROP_FPS) or 25
                frame_delay = 1.0 / src_fps
                total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) if isinstance(source, str) else 0
                self._reset_tracks()
                with self.lock:
                    self.source, self.is_file, self.loop_file = source, isinstance(source, str), loop
                    self.finished = False
                    self.progress = 0.0 if self.is_file else None
                play_start = time.time()
                print(f"[camera] switched to {source!r}")

            if self.finished:
                self._finish_clip(last_frame)
                time.sleep(0.1)
                continue

            if self.is_file and not self.loop_file:
                # test videos run in real time like a live camera: skip the frames the engine is too slow for
                behind = int((time.time() - play_start) * src_fps) - int(cap.get(cv2.CAP_PROP_POS_FRAMES))
                for _ in range(max(0, behind)):
                    if not cap.grab():
                        break

            ok, frame = cap.read()
            if not ok:
                if self.is_file and self.loop_file:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)   # loop the video
                    continue
                if self.is_file:                          # test video: stop on its last frame
                    with self.lock:
                        self.finished = True
                        self.progress = 1.0
                        self.unknown_count = 0
                        self.in_view = []
                    cap.release()       # unlock the file (Windows) so it can be replaced by an upload
                    continue
                failed_reads += 1
                if failed_reads % 100 == 1:
                    print(f"[camera] no frames from source {self.source!r} "
                          "(in use by another app, or try VIDEO_SOURCE=1 in .env)")
                time.sleep(0.05)
                continue
            failed_reads = 0

            # `full` (<= CAPTURE_W wide) is used for YOLO and face crops; drawing, streaming
            # and clips use the PROCESS_W-wide `frame`. Video files are often 1080p.
            h0, w0 = frame.shape[:2]
            if w0 > CAPTURE_W:
                frame = cv2.resize(frame, (CAPTURE_W, int(h0 * CAPTURE_W / w0)))
            full = frame
            if full.shape[1] > PROCESS_W:
                frame = cv2.resize(full, (PROCESS_W, int(full.shape[0] * PROCESS_W / full.shape[1])),
                                   interpolation=cv2.INTER_AREA)
            scale = full.shape[1] / frame.shape[1]      # frame -> full coordinates

            current_unknown = set()
            pending = []              # (tid, event_type, name) to trigger after drawing
            seen_known = set()        # recognised people in this frame
            in_view = []              # [{name, kind}] for /api/status
            now = time.time()
            if now >= self._next_level_check:
                self._refresh_level(now)
            with self.lock:
                known, people = self.known, self.people
                params, level = self.params, self.level
                off_until = self.security["off_until"] if level == "off" else None
            frame_count += 1
            frame_h, frame_w = frame.shape[:2]
            for tid in stale_tracks(self.track_seen, now, TRACK_END_SEC) - self.closed:
                self.closed.add(tid)
                self._close_track(tid, now)
            if now >= self._next_prune:
                self._forget_tracks(stale_tracks(self.track_seen, now, TRACK_FORGET_SEC))
                self._next_prune = now + PRUNE_INTERVAL

            # YOLO sees the full capture (more pixels for far people at DETECTOR_IMGSZ > 640);
            # its boxes are scaled back to `frame` coordinates below
            res = self.detector.track(full, classes=DETECT_CLASSES,
                                      conf=TRACK_LOW_CONF,
                                      persist=True, tracker="bytetrack.yaml",
                                      verbose=False, **self.detect_kwargs)[0]
            new_items = []            # (tid, labels) seen on an already-alerted intruder

            if res.boxes.id is not None:
                boxes = (res.boxes.xyxy.cpu().numpy() / scale).astype(int)   # full -> frame
                ids = res.boxes.id.int().cpu().tolist()
                classes = res.boxes.cls.int().cpu().tolist()
                confs = res.boxes.conf.cpu().tolist()
                for t, c, p in zip(ids, classes, confs):
                    if c == 0 and p >= params["person_conf"]:
                        self.confirmed.add(t)
                persons = [(b, t, p) for b, t, c, p in zip(boxes, ids, classes, confs)
                           if c == 0 and t in self.confirmed]
                items = [(ITEM_CLASSES[c], tuple(int(v) for v in b), p)
                         for b, c, p in zip(boxes, classes, confs)
                         if c in ITEM_CLASSES and p >= ITEM_CONF]
                for label, (ix1, iy1, ix2, iy2), p in items:
                    cv2.rectangle(frame, (ix1, iy1), (ix2, iy2), ITEM_COLOR, 2)
                    cv2.putText(frame, f"{label} {p:.2f}", (ix1, max(15, iy1 - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, ITEM_COLOR, 2)
                item_boxes = [(label, box) for label, box, _ in items]

                for (x1, y1, x2, y2), tid, det_conf in persons:
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(frame_w, x2), min(frame_h, y2)
                    person_w, person_h = x2 - x1, y2 - y1
                    if person_w < 20 or person_h < 20:
                        continue
                    self.track_seen[tid] = now
                    self.trails.setdefault(tid, deque(maxlen=TRAIL_LEN)).append(((x1 + x2) // 2, y2))
                    first_h, last_h = self.size_hist.setdefault(tid, ([], deque(maxlen=SIZE_SAMPLES)))
                    if len(first_h) < SIZE_SAMPLES:
                        first_h.append(person_h / frame_h)
                    last_h.append(person_h / frame_h)
                    self.track_age[tid] = self.track_age.get(tid, 0) + 1
                    if self.track_age[tid] == 1:
                        self._carry_unknown_timer(tid, (x1, y1, x2, y2), now)
                    self.last_box[tid] = (x1, y1, x2, y2)
                    if self.track_age[tid] < params["min_track_frames"]:
                        continue

                    current_name = self.identity.get(tid, "unknown")
                    interval = (FACE_REC_INTERVAL if current_name == "unknown"
                                else VERIFY_INTERVAL)
                    since_check = frame_count - self.last_checked.get(tid, -999)

                    if since_check >= interval:
                        self.last_checked[tid] = frame_count

                        # head & shoulders only (top 55% of the person), cut from the full capture
                        hx1, hy1 = int(x1 * scale), int(y1 * scale)
                        hx2 = min(full.shape[1], int(x2 * scale))
                        hy2 = min(full.shape[0], int((y1 + person_h * 0.55) * scale))
                        head_crop = full[hy1:hy2, hx1:hx2]

                        if head_crop.size > 0:
                            detected_faces = self.face_app.get(head_crop)
                            detected_faces = [d for d in detected_faces
                                              if d.det_score >= MIN_DET_SCORE
                                              and (d.bbox[2] - d.bbox[0]) >= MIN_FACE_PX]
                            if detected_faces:
                                # one face per person: nearest to the head anchor (crop coords)
                                ax, ay = person_w * scale / 2, person_h * scale * 0.15
                                f = min(detected_faces, key=lambda d:
                                        (((d.bbox[0] + d.bbox[2]) / 2 - ax) ** 2 +
                                         ((d.bbox[1] + d.bbox[3]) / 2 - ay) ** 2))
                                box = (int(f.bbox[0] / scale + x1), int(f.bbox[1] / scale + y1),
                                       int(f.bbox[2] / scale + x1), int(f.bbox[3] / scale + y1))
                                n, s = self._identify(f.normed_embedding, known,
                                                      params["match_thresh"])
                                print(f"[face] track {tid}: {n} {s:.2f} face={int(f.bbox[2]-f.bbox[0])}px")
                                self.last_faces[tid] = [(box, n, s)]

                                if current_name == "unknown":
                                    self.identity[tid] = n
                                    self.verify_fail[tid] = 0
                                elif n == current_name:
                                    self.verify_fail[tid] = 0
                                else:
                                    # visible face disagrees with the locked identity
                                    self.verify_fail[tid] = self.verify_fail.get(tid, 0) + 1
                                    if self.verify_fail[tid] >= VERIFY_FAILS:
                                        self.identity[tid] = n   # "unknown" or someone else
                                        self.verify_fail[tid] = 0
                            elif current_name == "unknown":
                                self.last_faces[tid] = []

                    name = self.identity.get(tid, "unknown")
                    if name != "unknown" and name not in known:
                        name = self.identity[tid] = "unknown"   # person was deleted
                    if name != "unknown":
                        self.track_names[tid] = name
                    elif ((DEPARTURE_FILTER or params["departure_filter"])
                          and tid not in self.alerted and is_departing(first_h, last_h)):
                        self.departing.add(tid)
                    if name == "unknown" and tid in self.departing:
                        # someone from inside walking out, face not seen: no alert
                        self.unknown_since.pop(tid, None)
                        in_view.append({"name": "unknown", "kind": "leaving"})
                        self._draw_trail(frame, self.trails.get(tid), LEAVING_COLOR, False)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), LEAVING_COLOR, 1)
                        cv2.putText(frame, f"leaving #{tid}", (x1, max(20, y1 - 8)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, LEAVING_COLOR, 1)
                        continue
                    if name == "unknown" and item_boxes:
                        near = set(items_near((x1, y1, x2, y2), item_boxes))
                        added = near - self.track_items.get(tid, set())
                        if added:
                            self.track_items.setdefault(tid, set()).update(added)
                            if tid in self.track_event:
                                new_items.append((tid, sorted(added)))
                    if name == "unknown":
                        current_unknown.add(tid)
                        self.unknown_since.setdefault(tid, now)
                        if (params["alerts"] and now - self.unknown_since[tid] >= params["grace"]
                                and tid not in self.alerted):
                            self.alerted.add(tid)
                            pending.append((tid, "intrusion", "unknown"))
                    else:
                        self.unknown_since.pop(tid, None)

                    kind = classify_person(name, people.get(name), now)
                    in_view.append({"name": name, "kind": VIEW_KIND.get(kind, kind)})
                    if kind != UNKNOWN:
                        seen_known.add(name)
                    if params["alerts"] and kind == GUEST_OUTSIDE and tid not in self.guest_alerted:
                        self.guest_alerted.add(tid)
                        pending.append((tid, GUEST_OUTSIDE, name))

                    color, label = STYLE[kind]
                    self._draw_trail(frame, self.trails.get(tid), color, kind == UNKNOWN)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    # person detection score this frame (weak = kept by tracking, see TRACK_LOW_CONF)
                    cv2.putText(frame, f"{label.format(name=name)} #{tid} {det_conf:.2f}",
                                (x1, max(20, y1 - 8)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

                    for (fx1, fy1, fx2, fy2), n, s in self.last_faces.get(tid, []):
                        cv2.rectangle(frame, (fx1, fy1), (fx2, fy2),
                                      FACE_BOX_COLOR, 1)
                        cv2.putText(frame, f"{n} {s:.2f}", (fx1, fy2 + 18),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                                    FACE_BOX_COLOR, 1)

            # FPS (smoothed)
            curr = time.time()
            dt = curr - prev_time
            prev_time = curr
            if dt > 0:
                fps = 0.9 * fps + 0.1 * (1.0 / dt) if fps > 0 else (1.0 / dt)

            # overlays are drawn BEFORE recording/streaming
            cv2.putText(frame, f"FPS: {fps:.1f}", (15, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            cv2.putText(frame, f"Unknown: {len(current_unknown)}", (15, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
            self._draw_level(frame, level, off_until)
            if self.is_file and self.source != self.default_source:
                cv2.putText(frame, f"TEST VIDEO: {Path(self.source).name}", (15, frame_h - 15),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            for tid, event_type, name in pending:
                self._trigger_event(tid, frame, now, event_type, name,
                                    len(current_unknown), fps)
            for tid, added in new_items:
                self._report_late_items(tid, added)
            self.recorder.add(frame, now)
            last_frame = frame

            ok2, buf = cv2.imencode(".jpg", frame,
                                    [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ok2:
                with self.lock:
                    self.latest_jpeg = buf.tobytes()
                    self.unknown_count = len(current_unknown)
                    self.in_view = in_view
                    self.fps = fps
                    if self.is_file and total_frames > 0:
                        self.progress = min(1.0, cap.get(cv2.CAP_PROP_POS_FRAMES) / total_frames)
                    for n in seen_known:
                        self.last_seen[n] = now

            if self.is_file:   # don't run faster than the video's real speed
                time.sleep(max(0, frame_delay - (time.time() - now)))

        cap.release()

    def _carry_unknown_timer(self, tid, box, now):
        """A new track id close to where an unknown person was just lost (ByteTrack dropped
        them) keeps that person's grace timer and alerted status: no restart, no second alert.
        Residents are never candidates (rules.match_lost_unknown) and no identity is copied."""
        lost = {t: {"box": b, "seen": self.track_seen.get(t, 0.0),
                    "identity": self.identity.get(t, UNKNOWN),
                    "unknown_since": self.unknown_since.get(t)}
                for t, b in self.last_box.items() if t != tid and self.track_seen.get(t, 0.0) < now}
        old = match_lost_unknown(box, lost, now)
        if old is None:
            return
        self.unknown_since[tid] = self.unknown_since.pop(old)   # one heir per lost track
        if old in self.alerted:
            self.alerted.add(tid)
            if old in self.track_event:
                self.track_event[tid] = self.track_event[old]
        print(f"[track] {tid} continues unknown track {old} "
              f"(timer {now - self.unknown_since[tid]:.1f} s, alerted={old in self.alerted})")

    @staticmethod
    def _draw_trail(frame, trail, color, emphasise):
        """Where the person walked (foot points). Unknown people get a thick trail with a start
        dot, others a thin one; the trail is part of the frame, so it is also in the snapshot."""
        if not trail or len(trail) < 2:
            return
        pts = np.array(trail, np.int32).reshape(-1, 1, 2)
        cv2.polylines(frame, [pts], False, color, 3 if emphasise else 1, cv2.LINE_AA)
        if emphasise:
            cv2.circle(frame, trail[0], 5, color, -1, cv2.LINE_AA)

    @staticmethod
    def _draw_level(frame, level, off_until=None):
        """Security level in the top-right corner: "ON", "OFF" or "OFF until 01:00"."""
        text = level.upper()
        if level == "off" and off_until:
            text += time.strftime(" until %H:%M", time.localtime(off_until))
        font, scale, thick = cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2
        (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
        x, y = frame.shape[1] - tw - 15, 30
        cv2.rectangle(frame, (x - 6, y - th - 6), (x + tw + 6, y + 8), (0, 0, 0), -1)
        cv2.putText(frame, text, (x, y), font, scale, LEVEL_COLOR[level], thick)

    def _trigger_event(self, tid, frame, now, event_type, name, n_unknown, fps):
        """Snapshot + clip + DB row + Telegram for an intrusion or a visitor outside their window."""
        stamp = time.strftime("%Y%m%d_%H%M%S")
        snap = str(SNAP_DIR / f"{stamp}_id{tid}.jpg")
        clip = str(CLIP_DIR / f"{stamp}_id{tid}.mp4")
        cv2.imwrite(snap, frame)
        clip = self.recorder.trigger(clip, fps)   # may be the clip already recording
        with self.lock:
            guard_alert = self.params["guard_alert"]    # on at every level
        items = sorted(self.track_items.get(tid, ())) if event_type == "intrusion" else []
        carrying = f"\n\u26a0 Carrying: {items_text(items)}" if items else ""
        # every due intrusion reaches the Guard House view, even inside the Telegram cooldown
        event_id = log_event(self.camera_name, tid, name, event_type, clip, snap,
                             guard_notified=guard_alert_due(event_type, guard_alert),
                             items=items)
        if event_type == "intrusion":
            self.track_event[tid] = event_id
        if now - self.last_tg.get(event_type, 0.0) <= TG_COOLDOWN:
            return
        self.last_tg[event_type] = now
        if event_type == GUEST_OUTSIDE:
            text = (f"VISITOR OUTSIDE ALLOWED TIME at {self.camera_name}\n"
                    f"Visitor: {name}\n"
                    f"Time: {time.strftime('%H:%M:%S')}")
        else:
            text = (f"INTRUSION at {self.camera_name}\n"
                    f"Unknown people in view: {n_unknown}\n"
                    f"Time: {time.strftime('%H:%M:%S')}{carrying}")
        send_telegram(text, snap)

        # guard-house Telegram copy: as above, and only if a guard chat is configured
        # (GUARD_TG_CHAT_ID, or a separate guard bot GUARD_TG_TOKEN)
        guard_chat = guard_chat_id()
        if should_alert_guard(event_type, guard_alert, guard_chat):
            guard_text = (f"GUARD HOUSE ALERT: unknown person\n"
                          f"Unit: {house_unit()}\n"
                          f"Camera: {self.camera_name}\n"
                          f"Unknown people in view: {n_unknown}\n"
                          f"Time: {time.strftime('%H:%M:%S')}{carrying}")
            # text only: no snapshot of the home goes to the guard house (privacy)
            send_telegram(guard_text, chat_id=guard_chat, token=guard_token())

    def _close_track(self, tid, now):
        """A track left the view: record arrived / left for a known person, or "someone left"
        for a departing unknown (family tracker)."""
        hist = self.size_hist.get(tid)
        if not hist:
            return
        direction = movement_direction(*hist)
        name = self.track_names.get(tid)
        if direction is None or (name is None and tid not in self.departing):
            return
        try:
            log_movement(name, direction, "camera", now)
            print(f"[tracker] {name or 'someone (face not seen)'} {direction}")
        except Exception as e:
            print("[tracker] could not save movement:", e)

    def _report_late_items(self, tid, added):
        """An item first seen after the intrusion was logged: update the event and warn once
        per new item (homeowner, plus the guard house when it has a Telegram chat)."""
        set_event_items(self.track_event[tid], sorted(self.track_items[tid]))
        text = (f"\u26a0 Intruder at {self.camera_name} now seen carrying: {items_text(added)}\n"
                f"Time: {time.strftime('%H:%M:%S')}")
        send_telegram(text)
        guard_chat = guard_chat_id()
        if guard_chat:
            send_telegram(f"{text}\nUnit: {house_unit()}", chat_id=guard_chat, token=guard_token())
