import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import pickle
import threading
import time
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO
from insightface.app import FaceAnalysis

from rules import (DEFAULT_LEVEL, DEFAULT_NIGHT_END, DEFAULT_NIGHT_START,
                   FAMILY, GUEST_ALLOWED, GUEST_OUTSIDE, SECURITY_LEVELS,
                   UNKNOWN, classify_person, effective_level, security_params,
                   should_alert_guard, valid_hhmm)
from vault_utils import (CAMERA_NAME, CLIP_DIR, FACES_DIR, SNAP_DIR,
                         ClipRecorder, get_settings, guard_chat_id, house_unit,
                         init_db, load_people, log_event, mark_guard_notified,
                         send_telegram, set_settings, sync_people)

VERIFY_INTERVAL = 30      # frames between re-checks of an already-recognized person
VERIFY_FAILS = 2          # consecutive mismatches before the lock is released

# GRACE / MOVE_REQUIRED / MATCH_THRESH depend on the security level: see rules.security_params
TG_COOLDOWN = 15.0        # min seconds between Telegram messages of the same event type
FACE_REC_INTERVAL = 8     # frames between face-recognition attempts per person
CLIP_PRE_SEC = 5          # seconds of video kept before an event
CLIP_POST_SEC = 5         # seconds recorded after the (last) event; clips use the measured FPS
IMG_EXT = {".jpg", ".jpeg", ".png"}

PERSON_CONF = 0.55       # ignore weak "person" detections
MIN_TRACK_FRAMES = 10    # a track must exist this many frames before it counts
MIN_FACE_PX = 40         # ignore faces smaller than this (garbage embeddings)
MIN_DET_SCORE = 0.6      # ignore low-confidence face detections

LEVEL_COLOR = {"home": (0, 200, 0), "normal": (0, 255, 255), "away": (0, 0, 255)}  # BGR
LEVEL_CHECK_INTERVAL = 1.0   # seconds between night-schedule re-checks

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

        # Lightweight detector and CPU-optimized face analyzer
        self.detector = YOLO("yolov8n.pt")
        self.face_app = FaceAnalysis(name="buffalo_s")
        self.face_app.prepare(ctx_id=-1, det_size=(320, 320))

        self.faces_path = Path(FACES_DIR)
        self.cache_file = self.faces_path / "embeddings.pkl"
        self.known = {}           # name -> (n, 512) embeddings; swapped whole under self.lock
        self.people = {}          # name -> people row; swapped whole under self.lock
        self._reload_lock = threading.Lock()   # serialises reload_people() calls
        self.last_seen = {}       # name -> epoch of last frame a known person was in view (self.lock)

        # security level + night schedule (all under self.lock); loaded from settings in start()
        self.security = {"level": DEFAULT_LEVEL, "night_enabled": False,
                         "night_start": DEFAULT_NIGHT_START,
                         "night_end": DEFAULT_NIGHT_END, "updated_at": None}
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
        self.first_pos = {}      # track_id -> first (cx, cy)
        self.moved = set()       # track_ids that have actually moved


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
            with self.lock:
                self.known = known
                self.people = people

    # ---------- security level ----------
    def _load_security(self):
        stored = get_settings()
        sec = dict(self.security)
        level = stored.get("security_level", (None,))[0]
        if level in SECURITY_LEVELS:
            sec["level"] = level
        sec["night_enabled"] = stored.get("night_enabled", ("0",))[0] == "1"
        for key in ("night_start", "night_end"):
            if valid_hhmm(stored.get(key, (None,))[0]):
                sec[key] = stored[key][0]
        times = [t for _, t in stored.values() if t]
        sec["updated_at"] = max(times) if times else None
        with self.lock:
            self.security = sec
        self._refresh_level(time.time())

    def _refresh_level(self, now):
        """Recompute the effective level (night schedule) and its rule thresholds."""
        with self.lock:
            s = self.security
            level = effective_level(s["level"], s["night_enabled"],
                                    s["night_start"], s["night_end"], now)
            if level != self.level:
                print(f"[security] effective level -> {level}")
            self.level = level
            self.params = security_params(level)
            self._next_level_check = now + LEVEL_CHECK_INTERVAL

    def set_security(self, level=None, night_enabled=None, night_start=None,
                     night_end=None):
        """Change the level and/or night schedule, persist it, apply it at once.
        Raises ValueError on an unknown level or a bad "HH:MM"."""
        if level is not None and level not in SECURITY_LEVELS:
            raise ValueError(f"level must be one of {', '.join(SECURITY_LEVELS)}")
        for t in (night_start, night_end):
            if t is not None and not valid_hhmm(t):
                raise ValueError(f"bad time {t!r}: use 24-hour HH:MM")
        changes = {}
        if level is not None:
            changes["security_level"] = level
        if night_enabled is not None:
            changes["night_enabled"] = "1" if night_enabled else "0"
        if night_start is not None:
            changes["night_start"] = night_start
        if night_end is not None:
            changes["night_end"] = night_end
        if changes:
            updated = set_settings(changes)
            with self.lock:
                s = self.security
                if level is not None:
                    s["level"] = level
                if night_enabled is not None:
                    s["night_enabled"] = bool(night_enabled)
                if night_start is not None:
                    s["night_start"] = night_start
                if night_end is not None:
                    s["night_end"] = night_end
                s["updated_at"] = updated
            self._refresh_level(time.time())
        return self.get_security()

    def set_security_level(self, level):
        return self.set_security(level=level)

    def get_security(self):
        """{level, effective_level, night_enabled, night_start, night_end, updated_at}."""
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
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        return cap

    def _reset_tracks(self):
        """Forget every track: a new source restarts ByteTrack ids at 1."""
        for d in (self.identity, self.last_faces, self.last_checked, self.verify_fail,
                  self.unknown_since, self.track_age, self.first_pos):
            d.clear()
        for s in (self.alerted, self.guest_alerted, self.moved):
            s.clear()
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
                    continue
                failed_reads += 1
                if failed_reads % 100 == 1:
                    print(f"[camera] no frames from source {self.source!r} "
                          "(in use by another app, or try VIDEO_SOURCE=1 in .env)")
                time.sleep(0.05)
                continue
            failed_reads = 0

            # keep processing size the same as the webcam (video files are often 1080p)
            h0, w0 = frame.shape[:2]
            if w0 > 640:
                frame = cv2.resize(frame, (640, int(h0 * 640 / w0)))

            current_unknown = set()
            pending = []              # (tid, event_type, name) to trigger after drawing
            seen_known = set()        # recognised people in this frame
            in_view = []              # [{name, kind}] for /api/status (static figures excluded)
            now = time.time()
            if now >= self._next_level_check:
                self._refresh_level(now)
            with self.lock:
                known, people = self.known, self.people
                params, level = self.params, self.level
                night = level != self.security["level"]
            frame_count += 1
            frame_h, frame_w = frame.shape[:2]

            res = self.detector.track(frame, classes=[0], conf=PERSON_CONF,
                                      persist=True, tracker="bytetrack.yaml",
                                      verbose=False)[0]

            if res.boxes.id is not None:
                boxes = res.boxes.xyxy.cpu().numpy().astype(int)
                ids = res.boxes.id.int().cpu().tolist()

                for (x1, y1, x2, y2), tid in zip(boxes, ids):
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(frame_w, x2), min(frame_h, y2)
                    person_w, person_h = x2 - x1, y2 - y1
                    if person_w < 20 or person_h < 20:
                        continue
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    fx, fy = self.first_pos.setdefault(tid, (cx, cy))
                    if abs(cx - fx) + abs(cy - fy) > params["move_required"] * frame_w:
                        self.moved.add(tid)
                    self.track_age[tid] = self.track_age.get(tid, 0) + 1
                    if self.track_age[tid] < MIN_TRACK_FRAMES:
                        continue

                    current_name = self.identity.get(tid, "unknown")
                    interval = (FACE_REC_INTERVAL if current_name == "unknown"
                                else VERIFY_INTERVAL)
                    since_check = frame_count - self.last_checked.get(tid, -999)

                    if since_check >= interval:
                        self.last_checked[tid] = frame_count

                        # head & shoulders only (top 55% of the person)
                        head_y2 = min(frame_h, y1 + int(person_h * 0.55))
                        head_crop = frame[y1:head_y2, x1:x2]

                        if head_crop.size > 0:
                            detected_faces = self.face_app.get(head_crop)
                            detected_faces = [d for d in detected_faces
                                              if d.det_score >= MIN_DET_SCORE
                                              and (d.bbox[2] - d.bbox[0]) >= MIN_FACE_PX]
                            if detected_faces:
                                # one face per person: nearest to the head anchor
                                ax, ay = person_w / 2, person_h * 0.15
                                f = min(detected_faces, key=lambda d:
                                        (((d.bbox[0] + d.bbox[2]) / 2 - ax) ** 2 +
                                         ((d.bbox[1] + d.bbox[3]) / 2 - ay) ** 2))
                                box = (int(f.bbox[0] + x1), int(f.bbox[1] + y1),
                                       int(f.bbox[2] + x1), int(f.bbox[3] + y1))
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
                    moved = tid in self.moved or params["move_required"] <= 0
                    if name == "unknown" and not moved:
                        # hasn't moved: could be a poster or statue. Grey box, never alert.
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (150, 150, 150), 1)
                        cv2.putText(frame, "static?", (x1, max(20, y1 - 8)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 1)
                        continue
                    if name == "unknown":
                        current_unknown.add(tid)
                        self.unknown_since.setdefault(tid, now)
                        if (now - self.unknown_since[tid] >= params["grace"]
                                and tid not in self.alerted):
                            self.alerted.add(tid)
                            pending.append((tid, "intrusion", "unknown"))
                    else:
                        self.unknown_since.pop(tid, None)

                    kind = classify_person(name, people.get(name), now)
                    in_view.append({"name": name, "kind": VIEW_KIND.get(kind, kind)})
                    if kind != UNKNOWN:
                        seen_known.add(name)
                    if kind == GUEST_OUTSIDE and tid not in self.guest_alerted:
                        self.guest_alerted.add(tid)
                        pending.append((tid, GUEST_OUTSIDE, name))

                    color, label = STYLE[kind]
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(frame, f"{label.format(name=name)} #{tid}",
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
            self._draw_level(frame, level, night)
            if self.is_file and self.source != self.default_source:
                cv2.putText(frame, f"TEST VIDEO: {Path(self.source).name}", (15, frame_h - 15),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            for tid, event_type, name in pending:
                self._trigger_event(tid, frame, now, event_type, name,
                                    len(current_unknown), fps)
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

    @staticmethod
    def _draw_level(frame, level, night):
        """Security level in the top-right corner, e.g. "AWAY (night)"."""
        text = level.upper() + (" (night)" if night else "")
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
        event_id = log_event(self.camera_name, tid, name, event_type, clip, snap)
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
                    f"Time: {time.strftime('%H:%M:%S')}")
        send_telegram(text, snap)

        # guard-house copy: intrusions only, not at level "home", only if GUARD_TG_CHAT_ID is set
        guard_chat = guard_chat_id()
        with self.lock:
            guard_alert = self.params["guard_alert"]
        if should_alert_guard(event_type, guard_alert, guard_chat):
            guard_text = (f"GUARD HOUSE ALERT: unknown person\n"
                          f"Unit: {house_unit()}\n"
                          f"Camera: {self.camera_name}\n"
                          f"Unknown people in view: {n_unknown}\n"
                          f"Time: {time.strftime('%H:%M:%S')}")
            send_telegram(guard_text, snap, chat_id=guard_chat,
                          on_sent=lambda: mark_guard_notified(event_id))
